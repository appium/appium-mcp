/**
 * AI Vision Finder Module
 *
 * Core module for AI-powered element finding using vision models.
 * Implementation aligns with benchmark_model.ts standards.
 */

import { imageUtil } from '@appium/support';
import axios, { AxiosError } from 'axios';
import crypto from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as os from 'node:os';
import type {
  AIVisionConfig,
  BBoxCoordinates,
  AIFindResult,
  CacheStorage,
} from './types.js';
import log from '../logger.js';

/**
 * AI Vision Finder class
 * Based on benchmark results: Qwen3-VL-235B-A22B-Instruct (100% accuracy, 8417ms)
 */
export class AIVisionFinder {
  private config: AIVisionConfig;
  private cache: CacheStorage = {};
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 50;

  constructor() {
    // Environment-based configuration (matches benchmark_model.ts)
    this.config = {
      model: process.env.AI_VISION_MODEL || 'Qwen3-VL-235B-A22B-Instruct',
      apiBaseUrl: process.env.API_BASE_URL || '',
      apiToken: process.env.API_TOKEN || '',
      coordType: (process.env.AI_VISION_COORD_TYPE || 'normalized') as
        | 'normalized'
        | 'absolute',
      imageMaxWidth: parseInt(
        process.env.AI_VISION_IMAGE_MAX_WIDTH || '1080',
        10
      ),
      imageQuality: parseInt(process.env.AI_VISION_IMAGE_QUALITY || '80', 10),
    };

    // Validate required environment variables
    if (!this.config.apiBaseUrl) {
      throw new Error(
        'API_BASE_URL environment variable is required for AI vision finding'
      );
    }
    if (!this.config.apiToken) {
      throw new Error(
        'API_TOKEN environment variable is required for AI vision finding'
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
      const compressedBase64 = await this.compressImage(
        screenshotBase64,
        imageWidth,
        imageHeight
      );

      // Step 2: Build prompt (always use original image dimensions)
      const prompt = this.buildPrompt(instruction, imageWidth, imageHeight);

      // Step 3: Call vision model API
      const response = await this.callVisionAPI(
        compressedBase64,
        prompt,
        'image/jpeg'
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
   */
  private async compressImage(
    base64Image: string,
    width: number,
    height: number
  ): Promise<string> {
    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');

      // Use @appium/support imageUtil for compression
      const sharp = imageUtil.requireSharp();
      let sharpInstance = sharp(imageBuffer);

      // Resize if image is too large
      if (width > this.config.imageMaxWidth) {
        const scaleFactor = this.config.imageMaxWidth / width;
        const newHeight = Math.floor(height * scaleFactor);
        log.info(
          `AI Vision: Resizing image from ${width}x${height} to ${this.config.imageMaxWidth}x${newHeight}`
        );
        sharpInstance = sharpInstance.resize(
          this.config.imageMaxWidth,
          newHeight
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

      return compressedBuffer.toString('base64');
    } catch (error) {
      // If compression fails, return original image
      log.warn('AI Vision: Image compression failed, using original:', error);
      return base64Image;
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
    return `You are a professional mobile automation testing expert. Your task is to locate the "${instruction}" in the provided UI screenshot.

**CRITICAL: Output Format Rules**
You MUST respond using ONLY this exact format, nothing else:

action: **CLICK**
Parameters: {"target": "<exact visible text or icon description>", "bbox_2d": [<x1>, <y1>, <x2>, <y2>]}

**BBox Coordinates**
- x1: Left edge X coordinate (top-left corner of element)
- y1: Top edge Y coordinate (top-left corner of element)
- x2: Right edge X coordinate (bottom-right corner of element)
- y2: Bottom edge Y coordinate (bottom-right corner of element)

**Image Dimensions (ABSOLUTE PIXEL COORDINATES)**
- Width: ${width} pixels
- Height: ${height} pixels
- Origin (0,0): Top-left corner
- Max (${width}, ${height}): Bottom-right corner
- **MUST use integer values between 0-${width} for x, 0-${height} for y**

**What to Look For**
- **TARGET**: ${instruction}
- Identify the element precisely based on the description

**Examples of CORRECT responses:**
action: **CLICK**
Parameters: {"target": "Search", "bbox_2d": [100, 200, 300, 280]}
// target is exact visible text or icon description
// bbox_2d is absolute pixel coordinates, x1 and y1 are top-left corner, x2 and y2 are bottom-right corner

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
    try {
      log.info(`AI Vision: Calling API with model: ${this.config.model}`);
      const startTime = Date.now();

      const response = await axios.post(
        `${this.config.apiBaseUrl}/chat/completions`,
        {
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                  // Image size control parameters (from benchmark_model.ts)
                  min_pixels: 64 * 32 * 32, // 65536 pixels
                  max_pixels: 2560 * 32 * 32, // 2621440 pixels
                },
              ],
            },
          ],
          max_tokens: 4096,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiToken}`,
          },
          timeout: 120000, // 120s timeout (matches benchmark)
        }
      );

      const duration = Date.now() - startTime;
      log.info(`AI Vision: API call completed in ${duration}ms`);

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status || 'N/A';
        const errorData = error.response?.data;
        const errorDetail =
          errorData?.error?.message || errorData?.message || error.message;
        const errorMessage = `HTTP ${status}: ${errorDetail}`;
        log.error(`AI Vision: API call failed: ${errorMessage}`);
        throw new Error(`Vision API call failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * Parse bbox coordinates from model response
   * Matches benchmark_model.ts parsing logic
   */
  private parseBBox(response: string): BBoxCoordinates {
    try {
      // Try to match JSON format bbox
      const jsonMatch = response.match(/\{[^}]*"target"[^}]*"bbox_2d"[^}]*\}/);
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
   */
  private convertCoordinates(
    bbox: [number, number, number, number],
    width: number,
    height: number
  ): [number, number, number, number] {
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
    bbox: [number, number, number, number],
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

      // Determine save directory (prioritize SCREENSHOTS_DIR env var, fallback to os.tmpdir())
      const screenshotDir = process.env.SCREENSHOTS_DIR || os.tmpdir();

      // Create directory if it doesn't exist
      await mkdir(screenshotDir, { recursive: true });

      // Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `ai_vision_annotated_${timestamp}.png`;
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
   */
  private getFromCache(key: string): AIFindResult | null {
    const entry = this.cache[key];
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_TTL) {
      delete this.cache[key];
      return null;
    }

    return entry.result;
  }

  /**
   * Save result to cache with LRU eviction
   */
  private saveToCache(key: string, result: AIFindResult): void {
    // Clean expired entries
    const now = Date.now();
    Object.keys(this.cache).forEach((k) => {
      if (now - this.cache[k].timestamp > this.CACHE_TTL) {
        delete this.cache[k];
      }
    });

    // LRU eviction if cache is full
    if (Object.keys(this.cache).length >= this.MAX_CACHE_SIZE) {
      const oldestKey = Object.keys(this.cache).reduce((oldest, k) =>
        this.cache[k].timestamp < this.cache[oldest].timestamp ? k : oldest
      );
      delete this.cache[oldestKey];
    }

    this.cache[key] = {
      result,
      timestamp: now,
    };
  }
}
