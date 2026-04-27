/**
 * AI Vision Finder Module
 *
 * Core module for AI-powered element finding using vision models.
 * Implementation aligns with benchmark_model.ts standards.
 */

import { imageUtil } from '@appium/support';
import crypto from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveScreenshotDir } from '../utils/paths.js';
import { LRUCache } from 'lru-cache';
import type {
  AIVisionConfig,
  BBox,
  BBoxCoordinates,
  AIFindResult,
} from './types.js';
import log from '../logger.js';

/**
 * AI Vision Finder class
 * Based on benchmark results: Qwen3-VL-235B-A22B-Instruct (100% accuracy, 8417ms)
 */
export class AIVisionFinder {
  private config: AIVisionConfig;
  private readonly cache: LRUCache<string, AIFindResult>;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Environment-based configuration (matches benchmark_model.ts)
    this.config = {
      model: process.env.AI_VISION_MODEL || 'Qwen3-VL-235B-A22B-Instruct',
      apiBaseUrl: process.env.AI_VISION_API_BASE_URL || '',
      apiToken: process.env.AI_VISION_API_KEY || '',
      coordType: (process.env.AI_VISION_COORD_TYPE || 'normalized') as
        | 'normalized'
        | 'absolute',
      imageMaxWidth: parseInt(
        process.env.AI_VISION_IMAGE_MAX_WIDTH || '1080',
        10
      ),
      imageQuality: parseInt(process.env.AI_VISION_IMAGE_QUALITY || '80', 10),
    };

    // Initialize LRU cache: max 50 entries, TTL 5 minutes
    this.cache = new LRUCache<string, AIFindResult>({
      max: 50,
      ttl: this.CACHE_TTL_MS,
    });

    // Validate required environment variables
    if (!this.config.apiBaseUrl) {
      throw new Error(
        'AI_VISION_API_BASE_URL environment variable is required for AI vision finding'
      );
    }
    if (!this.config.apiToken) {
      throw new Error(
        'AI_VISION_API_KEY environment variable is required for AI vision finding'
      );
    }

    log.info(
      `AI Vision Finder initialized with model: ${this.config.model}, coordType: ${this.config.coordType}`
    );
  }

  /**
   * Find element using AI vision model
   * @param screenshotBase64 - Base64 encoded screenshot
   * @param instruction - Natural language instruction
   * @param imageWidth - Original image width
   * @param imageHeight - Original image height
   * @returns AI find result with bbox and center coordinates
   */
  async findElement(
    screenshotBase64: string,
    instruction: string,
    imageWidth: number,
    imageHeight: number
  ): Promise<AIFindResult> {
    try {
      log.info(`AI Vision: Finding element with instruction: "${instruction}"`);
      log.debug(`AI Vision: Image dimensions: ${imageWidth}x${imageHeight}`);

      // Check cache first
      const cacheKey = this.generateCacheKey(instruction, screenshotBase64);
      const cachedResult = this.getFromCache(cacheKey);
      if (cachedResult) {
        log.info('AI Vision: Using cached result');
        return cachedResult;
      }

      // Step 1: Compress image using @appium/support
      const { base64: compressedBase64, mimeType: compressedMimeType } =
        await this.compressImage(screenshotBase64, imageWidth, imageHeight);

      // Step 2: Build prompt (always use original image dimensions)
      const prompt = this.buildPrompt(instruction, imageWidth, imageHeight);

      // Step 3: Call vision model API
      const response = await this.callVisionAPI(
        compressedBase64,
        prompt,
        compressedMimeType
      );

      // Step 4: Parse bbox from response
      const { target, bbox_2d } = this.parseBBox(response);
      log.debug(
        `AI Vision: Parsed target: "${target}", bbox: [${bbox_2d.join(', ')}]`
      );

      // Step 5: Convert coordinates (normalized or absolute)
      const absoluteBBox = this.convertCoordinates(
        bbox_2d,
        imageWidth,
        imageHeight
      );

      // Step 6: Calculate center point for tapping
      const center = {
        x: Math.floor((absoluteBBox[0] + absoluteBBox[2]) / 2),
        y: Math.floor((absoluteBBox[1] + absoluteBBox[3]) / 2),
      };

      log.info(
        `AI Vision: Final center coordinates: (${center.x}, ${center.y})`
      );

      // Step 7: Draw bbox on image and save (with error handling)
      let annotatedImagePath: string | undefined;
      try {
        annotatedImagePath = await this.drawBBoxOnImage(
          screenshotBase64,
          absoluteBBox,
          imageWidth,
          imageHeight,
          target
        );
      } catch (error) {
        // Annotation failure should not block the main flow
        log.warn('AI Vision: Failed to create annotated image:', error);
      }

      const result: AIFindResult = {
        bbox: absoluteBBox,
        center,
        target,
        annotatedImagePath,
      };

      // Cache the result
      this.saveToCache(cacheKey, result);

      return result;
    } catch (error) {
      log.error('AI Vision: Element finding failed:', error);
      throw error;
    }
  }

  /**
   * Compress image using @appium/support sharp utilities
   * Reduces API latency and token consumption
   *
   * Returns both the base64-encoded image and its MIME type so that the caller
   * can construct a correct data URL. On compression failure the original bytes
   * are returned with mimeType 'image/png' (Appium screenshots are always PNG).
   *
   * **Resizing policy**: Resizing is intentionally skipped when
   * `coordType === 'absolute'`. In absolute mode the vision model returns pixel
   * coordinates relative to the image it received. If the image were resized,
   * those coordinates would map to the compressed dimensions rather than the
   * original screen dimensions, causing incorrect tap positions. Only JPEG
   * quality compression is applied in that case.
   */
  private async compressImage(
    base64Image: string,
    width: number,
    height: number
  ): Promise<{ base64: string; mimeType: string }> {
    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');

      // Use @appium/support imageUtil for compression
      const sharp = imageUtil.requireSharp();
      let sharpInstance = sharp(imageBuffer);

      // Resize only when using normalized coordinates.
      // In absolute mode, resizing would shift the model's returned pixel
      // coordinates away from the original screen dimensions.
      const shouldResize =
        this.config.coordType === 'normalized' &&
        width > this.config.imageMaxWidth;

      if (shouldResize) {
        const scaleFactor = this.config.imageMaxWidth / width;
        const newHeight = Math.floor(height * scaleFactor);
        log.info(
          `AI Vision: Resizing image from ${width}x${height} to ${this.config.imageMaxWidth}x${newHeight}`
        );
        sharpInstance = sharpInstance.resize(
          this.config.imageMaxWidth,
          newHeight
        );
      } else if (
        this.config.coordType === 'absolute' &&
        width > this.config.imageMaxWidth
      ) {
        log.info(
          `AI Vision: Skipping resize in absolute coord mode to preserve coordinate mapping (image: ${width}x${height})`
        );
      }

      // Compress to JPEG with quality setting
      const compressedBuffer = await sharpInstance
        .jpeg({ quality: this.config.imageQuality })
        .toBuffer();

      const originalSize = imageBuffer.length;
      const compressedSize = compressedBuffer.length;
      const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      log.info(
        `AI Vision: Image compressed: ${originalSize} → ${compressedSize} bytes (${reduction}% reduction)`
      );

      return {
        base64: compressedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      };
    } catch (error) {
      // If compression fails, return original PNG image with correct MIME type.
      // Appium screenshots are always PNG, so we must not claim image/jpeg here.
      log.warn('AI Vision: Image compression failed, using original:', error);
      return { base64: base64Image, mimeType: 'image/png' };
    }
  }

  /**
   * Build prompt for vision model
   * Matches benchmark_model.ts prompt format for consistency
   */
  private buildPrompt(
    instruction: string,
    width: number,
    height: number
  ): string {
    const isNormalized = this.config.coordType === 'normalized';

    const coordSection = isNormalized
      ? `**BBox Coordinates (0-1000 NORMALIZED)**
- Use normalized coordinates in the range 0-1000 (NOT pixel values)
- x1: Left edge (0 = left edge of image, 1000 = right edge)
- y1: Top edge (0 = top edge of image, 1000 = bottom edge)
- x2: Right edge
- y2: Bottom edge
- Origin (0,0): Top-left corner
- Max (1000,1000): Bottom-right corner
- Image Width: ${width} pixels, Image Height: ${height} pixels (for reference only)
- **MUST use integer values between 0-1000**`
      : `**BBox Coordinates (ABSOLUTE PIXEL COORDINATES)**
- x1: Left edge X coordinate (top-left corner of element)
- y1: Top edge Y coordinate (top-left corner of element)
- x2: Right edge X coordinate (bottom-right corner of element)
- y2: Bottom edge Y coordinate (bottom-right corner of element)
- Image Width: ${width} pixels, Image Height: ${height} pixels
- Origin (0,0): Top-left corner
- Max (${width}, ${height}): Bottom-right corner
- **MUST use integer values between 0-${width} for x, 0-${height} for y**`;

    return `You are a professional mobile automation testing expert. Your task is to locate the "${instruction}" in the provided UI screenshot.

**CRITICAL: Output Format Rules**
You MUST respond using ONLY this exact format, nothing else:

action: **CLICK**
Parameters: {"target": "<exact visible text or icon description>", "bbox_2d": [<x1>, <y1>, <x2>, <y2>]}

${coordSection}

**What to Look For**
- **TARGET**: ${instruction}
- Identify the element precisely based on the description

**Examples of CORRECT responses:**
action: **CLICK**
Parameters: {"target": "Search", "bbox_2d": [100, 200, 300, 280]}
// target is exact visible text or icon description
// bbox_2d coordinates follow the format described above

**Your response (STRICT FORMAT ONLY):**`;
  }

  /**
   * Call vision model API
   * Matches benchmark_model.ts implementation
   */
  private async callVisionAPI(
    imageBase64: string,
    prompt: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutMs = 120000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      log.info(`AI Vision: Calling API with model: ${this.config.model}`);
      const startTime = Date.now();

      const response = await fetch(
        `${this.config.apiBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiToken}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${imageBase64}`,
                    },
                    // Image size control parameters (from benchmark_model.ts)
                    min_pixels: 64 * 32 * 32, // 65536 pixels
                    max_pixels: 2560 * 32 * 32, // 2621440 pixels
                  },
                ],
              },
            ],
            max_tokens: 4096,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(async () => ({ message: await response.text() }));
        const errorDetail =
          errorData?.error?.message ||
          errorData?.message ||
          `HTTP ${response.status}`;
        const errorMessage = `HTTP ${response.status}: ${errorDetail}`;
        log.error(`AI Vision: API call failed: ${errorMessage}`);
        throw new Error(`Vision API call failed: ${errorMessage}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const duration = Date.now() - startTime;
      log.info(`AI Vision: API call completed in ${duration}ms`);

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(
          'Vision API response missing choices[0].message.content'
        );
      }

      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const errorMessage = `HTTP timeout after ${timeoutMs}ms`;
        log.error(`AI Vision: API call failed: ${errorMessage}`);
        throw new Error(`Vision API call failed: ${errorMessage}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse bbox coordinates from model response
   * Matches benchmark_model.ts parsing logic
   */
  private parseBBox(response: string): BBoxCoordinates {
    try {
      // Try to match JSON format bbox.
      // Use a key-order-independent regex: locate the object by the presence of
      // "bbox_2d": [...] regardless of whether "target" comes before or after it.
      const jsonMatch = response.match(
        /\{[^}]*"bbox_2d"\s*:\s*\[[^\]]+\][^}]*\}/
      );
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (
          parsed.bbox_2d &&
          Array.isArray(parsed.bbox_2d) &&
          parsed.bbox_2d.length === 4
        ) {
          return parsed;
        }
      }

      // Try to match array format [x1, y1, x2, y2]
      const arrayMatch = response.match(/\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/);
      if (arrayMatch) {
        return {
          target: 'Detected element',
          bbox_2d: [
            parseInt(arrayMatch[1], 10),
            parseInt(arrayMatch[2], 10),
            parseInt(arrayMatch[3], 10),
            parseInt(arrayMatch[4], 10),
          ],
        };
      }

      throw new Error('No valid bbox found in response');
    } catch (error) {
      log.error('AI Vision: Failed to parse bbox:', error);
      log.error('AI Vision: Response was:', response);
      throw new Error('Failed to parse bbox from vision model response');
    }
  }

  /**
   * Convert coordinates based on model's coordinate type
   * Matches benchmark_model.ts coordinate conversion logic
   *
   * Coordinate type modes:
   * - **normalized** (default, AI_VISION_COORD_TYPE=normalized):
   *   The vision model returns coordinates in the range 0–1000, where
   *   (0,0) is the top-left corner and (1000,1000) is the bottom-right corner.
   *   This method scales them to absolute pixel coordinates using the original
   *   image dimensions. This mode is independent of image compression.
   *
   * - **absolute** (AI_VISION_COORD_TYPE=absolute):
   *   The vision model returns pixel coordinates directly based on the image
   *   it received (which may be the compressed image). Coordinates are used
   *   as-is and are NOT automatically scaled back to the original resolution.
   *   Use this mode only if the model explicitly outputs absolute pixel values.
   */
  private convertCoordinates(bbox: BBox, width: number, height: number): BBox {
    let [x1, y1, x2, y2] = bbox;

    // Process according to model's configured coordinate type (matches benchmark_model.ts)
    if (this.config.coordType === 'normalized') {
      // Normalized coordinates (0-1000) → Absolute pixel coordinates
      const originalCoords = [x1, y1, x2, y2];
      x1 = Math.floor((x1 / 1000) * width);
      y1 = Math.floor((y1 / 1000) * height);
      x2 = Math.floor((x2 / 1000) * width);
      y2 = Math.floor((y2 / 1000) * height);
      log.debug(
        `AI Vision: Converted normalized coords ${JSON.stringify(originalCoords)} to absolute: [${x1}, ${y1}, ${x2}, ${y2}]`
      );
    } else {
      // Absolute pixel coordinates, use directly
      log.debug(
        `AI Vision: Using absolute coords: [${x1}, ${y1}, ${x2}, ${y2}]`
      );
    }

    // Ensure coordinate order is correct (x1 < x2, y1 < y2)
    if (x1 > x2) {
      [x1, x2] = [x2, x1];
      log.warn('AI Vision: Swapped x1 and x2 to ensure x1 < x2');
    }
    if (y1 > y2) {
      [y1, y2] = [y2, y1];
      log.warn('AI Vision: Swapped y1 and y2 to ensure y1 < y2');
    }

    // Ensure coordinates are within image bounds
    x1 = Math.max(0, Math.min(x1, width - 1));
    y1 = Math.max(0, Math.min(y1, height - 1));
    x2 = Math.max(0, Math.min(x2, width));
    y2 = Math.max(0, Math.min(y2, height));

    // Validate final coordinates
    if (x1 >= x2 || y1 >= y2) {
      throw new Error(
        `Invalid bbox coordinates after conversion: [${x1}, ${y1}, ${x2}, ${y2}]`
      );
    }

    return [x1, y1, x2, y2];
  }

  /**
   * Draw bounding box on image and save to file
   * Based on benchmark_model.ts drawBBoxOnImage implementation
   * @param screenshotBase64 - Base64 encoded screenshot
   * @param bbox - Bounding box coordinates [x1, y1, x2, y2]
   * @param imageWidth - Image width
   * @param imageHeight - Image height
   * @param targetName - Target element name for label
   * @returns Absolute path to the annotated image file
   */
  private async drawBBoxOnImage(
    screenshotBase64: string,
    bbox: BBox,
    imageWidth: number,
    imageHeight: number,
    targetName: string
  ): Promise<string> {
    try {
      const [x1, y1, x2, y2] = bbox;
      const boxWidth = x2 - x1;
      const boxHeight = y2 - y1;

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(screenshotBase64, 'base64');

      // Create SVG red box (3px width) with target name label
      const svg = `
      <svg width="${imageWidth}" height="${imageHeight}">
        <rect x="${x1}" y="${y1}" width="${boxWidth}" height="${boxHeight}"
              fill="none" stroke="red" stroke-width="3"/>
        <text x="${x1 + 5}" y="${y1 - 8}" font-family="Arial" font-size="14"
              fill="red" font-weight="bold">${targetName}</text>
      </svg>
    `;

      // Use sharp to overlay SVG on original image
      const sharp = imageUtil.requireSharp();
      const annotatedBuffer = await sharp(imageBuffer)
        .composite([
          {
            input: Buffer.from(svg),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();

      // Determine save directory (shared logic with screenshot.ts)
      const screenshotDir = resolveScreenshotDir();

      // Create directory if it doesn't exist
      await mkdir(screenshotDir, { recursive: true });

      // Generate filename with UUID for uniqueness
      const filename = `ai_vision_annotated_${crypto.randomUUID()}.png`;
      const filepath = join(screenshotDir, filename);

      // Save annotated image to file
      await writeFile(filepath, annotatedBuffer);

      log.info(`AI Vision: Annotated image saved to: ${filepath}`);
      log.debug(
        `AI Vision: BBox drawn: [${x1}, ${y1}, ${x2}, ${y2}] (${boxWidth}x${boxHeight})`
      );

      return filepath;
    } catch (error) {
      log.error('AI Vision: Failed to draw bbox on image:', error);
      throw error;
    }
  }

  /**
   * Generate cache key from instruction and image
   */
  private generateCacheKey(instruction: string, imageBase64: string): string {
    const imageHash = crypto
      .createHash('md5')
      .update(imageBase64)
      .digest('hex')
      .substring(0, 16);
    return `${instruction}_${imageHash}`;
  }

  /**
   * Get result from cache if valid
   * TTL expiry and LRU eviction are handled automatically by LRUCache
   */
  private getFromCache(key: string): AIFindResult | null {
    return this.cache.get(key) ?? null;
  }

  /**
   * Save result to cache
   * TTL expiry and LRU eviction are handled automatically by LRUCache
   */
  private saveToCache(key: string, result: AIFindResult): void {
    this.cache.set(key, result);
  }
}
