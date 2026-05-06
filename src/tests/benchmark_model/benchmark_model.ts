#!/usr/bin/env tsx

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageUtil } from '@appium/support';

const sharp = imageUtil.requireSharp();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Model list for benchmarking
 * Configure coordinate type for each model based on actual test results
 */
const MODELS: ModelConfig[] = [
  // Deepseek
  { name: 'DeepSeek-V3.2', coordType: 'absolute' },
  // Qwen
  { name: 'qwen3-vl-plus', coordType: 'normalized' },
  { name: 'qwen3-vl-8b-instruct', coordType: 'normalized' },
  { name: 'Qwen3-VL-235B-A22B-Instruct', coordType: 'normalized' },
  // tiktok
  { name: 'doubao-seed-2-0-pro-260215', coordType: 'normalized' },
  // moonshot
  { name: 'kimi-k2.5', coordType: 'absolute' },
  // openai
  { name: 'gpt-5.2-pro', coordType: 'absolute' },
  { name: 'gpt-5.2', coordType: 'absolute' },
  { name: 'gpt-5.1', coordType: 'absolute' },
  { name: 'gpt-5-nano', coordType: 'absolute' },
  // claude
  { name: 'claude-sonnet-4-6', coordType: 'absolute' },
  // google
  { name: 'gemini-3-flash-preview', coordType: 'absolute' },
  { name: 'gemini-3-pro-preview', coordType: 'absolute' },
  { name: 'gemini-2.5-pro', coordType: 'normalized' },
  { name: 'gemini-2.5-flash', coordType: 'normalized' },
  // xai
  { name: 'grok-4.1-fast', coordType: 'absolute' },
];

/**
 * Model configuration interface
 */
interface ModelConfig {
  name: string;
  // Coordinate type: 'normalized' means normalized coordinates (0-1000), 'absolute' means absolute pixel coordinates
  coordType: 'normalized' | 'absolute';
}

/**
 * Test result interface
 */
interface TestResult {
  modelName: string;
  response: string;
  duration: number;
  timestamp: string;
  error?: string;
  bbox?: number[];
  judgeResult?: number; // Judge model accuracy score (0-100%)
  annotatedImagePath?: string; // Annotated image path
}

/**
 * BBox coordinates interface
 */
interface BBoxCoordinates {
  target: string;
  bbox_2d: number[];
}

/**
 * Generate test prompt with image dimensions
 */
function generateTestPrompt(imageWidth: number, imageHeight: number): string {
  return `You are a professional mobile automation testing expert. Your task is to locate the "Search Button" in the provided UI screenshot.

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
- Width: ${imageWidth} pixels
- Height: ${imageHeight} pixels
- Origin (0,0): Top-left corner
- Max (${imageWidth}, ${imageHeight}): Bottom-right corner
- **MUST use integer values between 0-${imageWidth} for x, 0-${imageHeight} for y**

**What to Look For**
- **TARGET**: The YELLOW "搜索酒店" button (搜索酒店 means "Search Hotel")
- **LOCATION**: Bottom section of the screen, large yellow rounded rectangle button
- **APPEARANCE**: Bright yellow background with black text "搜索酒店"
- Choose ONLY the main yellow search button

**Examples of CORRECT responses:**
action: **CLICK**
Parameters: {"target": "Search", "bbox_2d": [100, 200, 300, 280]}
// target is exact visible text or icon description
// bbox_2d is absolute pixel coordinates, x1 and y1 are top-left corner, x2 and y2 are bottom-right corner

**Your response (STRICT FORMAT ONLY):**`;
}

/**
 * Read image as base64
 */
function readImageAsBase64(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Get MIME type from file extension
 */
function getMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/png';
}

async function postChatCompletions(
  baseUrl: string,
  token: string,
  body: unknown,
  timeoutMs: number
): Promise<{ choices?: Array<{ message?: { content?: string } }> }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(async () => ({ message: await response.text() }));
      const errorDetail =
        errorData?.error?.message ||
        errorData?.message ||
        `HTTP ${response.status}`;
      throw new Error(`HTTP ${response.status}: ${errorDetail}`);
    }

    return (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`HTTP timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call unified model API
 */
async function callModelAPI(
  model: ModelConfig,
  imageBase64: string,
  prompt: string,
  mimeType: string,
  _imageWidth: number,
  _imageHeight: number
): Promise<string> {
  const baseUrl = process.env.API_BASE_URL;
  const token = process.env.API_TOKEN;

  if (!baseUrl) {
    throw new Error('API_BASE_URL environment variable not set');
  }

  if (!token) {
    throw new Error('API_TOKEN environment variable not set');
  }

  const response = await postChatCompletions(
    baseUrl,
    token,
    {
      model: model.name,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
              // Add image size control parameters to ensure all models use the same image processing method
              min_pixels: 64 * 32 * 32, // 65536 pixels
              max_pixels: 2560 * 32 * 32, // 2621440 pixels
            },
          ],
        },
      ],
      max_tokens: 4096,
    },
    120000
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Model response missing choices[0].message.content');
  }
  return content;
}

/**
 * Judge model: Evaluate whether the search button in the annotated image is correctly boxed
 */
async function judgeAnnotation(
  annotatedImagePath: string,
  modelName: string
): Promise<number> {
  try {
    console.log(`\n🔍 [Judge] Evaluating ${modelName}...`);

    const imageBase64 = readImageAsBase64(annotatedImagePath);
    const mimeType = getMimeType(annotatedImagePath);

    const judgePrompt = `You are a professional UI testing quality evaluation expert. Please carefully observe this annotated image; there is a red border marking a UI element.

**Your Task:**
Evaluate how accurately the red bounding box encloses the "Search Button" or "Search Input Box". Return a percentage score from 0% to 100%.

**Scoring Guidelines:**
- 100%: Perfect match - The red box exactly and completely encloses the search button/input box with minimal extra space
- 80-99%: Good match - The red box fully contains the search button with slight extra margins or minor misalignment
- 60-79%: Fair match - The red box covers most of the search button but misses some edges or includes significant extra area
- 40-59%: Poor match - The red box partially covers the search button or is significantly misaligned
- 20-39%: Bad match - The red box barely touches the search button or covers mostly wrong area
- 0-19%: Very bad match - The red box completely misses the search button, enclosing unrelated elements or empty space

**Please strictly return in the following format:**
Accuracy Score: [0-100]%
Reason: [One sentence explaining the scoring reason]

Example:
Accuracy Score: 85%
Reason: The red box completely contains the yellow search button with slight margins on all sides.`;

    const baseUrl = process.env.API_BASE_URL;
    const token = process.env.API_TOKEN;

    // judge model
    if (!baseUrl || !token) {
      throw new Error('API_BASE_URL or API_TOKEN environment variable not set');
    }

    const response = await postChatCompletions(
      baseUrl,
      token,
      {
        model: 'qwen3-vl-plus',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: judgePrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
      },
      60000
    );

    const judgeResponse = response.choices?.[0]?.message?.content ?? '';
    console.log(`  Judge response: ${judgeResponse}`);

    // Parse accuracy score
    const scoreMatch = judgeResponse.match(/Accuracy Score[：:]?\s*(\d+)%?/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

    console.log(`  📊 Accuracy Score: ${score}%`);
    return score;
  } catch (error) {
    console.error(`✗ Judge failed for ${modelName}:`, error);
    return 0;
  }
}

/**
 * Parse bbox coordinates from model response
 */
function parseBBoxFromResponse(response: string): BBoxCoordinates | null {
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

    return null;
  } catch (error) {
    console.error('Failed to parse bbox:', error);
    return null;
  }
}

/**
 * Draw bounding box on image
 * Process according to the coordinate type configured for the model
 */
async function drawBBoxOnImage(
  originalImagePath: string,
  bbox: number[],
  outputPath: string,
  modelName: string,
  coordType: 'normalized' | 'absolute'
): Promise<void> {
  try {
    let [x1, y1, x2, y2] = bbox;

    // Read original image to get dimensions
    const image = sharp(originalImagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Failed to get image dimensions');
    }

    const width = metadata.width;
    const height = metadata.height;

    // Process according to model's configured coordinate type
    if (coordType === 'normalized') {
      // Normalized coordinates (0-1000) → Absolute pixel coordinates
      const originalCoords = [x1, y1, x2, y2];
      x1 = Math.floor((x1 / 1000) * width);
      y1 = Math.floor((y1 / 1000) * height);
      x2 = Math.floor((x2 / 1000) * width);
      y2 = Math.floor((y2 / 1000) * height);
      console.log(
        `  [${modelName}] Converted normalized coords ${JSON.stringify(originalCoords)} to absolute: [${x1}, ${y1}, ${x2}, ${y2}]`
      );
    } else {
      // Absolute pixel coordinates, use directly
      console.log(
        `  [${modelName}] Using absolute coords: [${x1}, ${y1}, ${x2}, ${y2}]`
      );
    }

    // Ensure coordinate order is correct (x1 < x2, y1 < y2)
    if (x1 > x2) {
      [x1, x2] = [x2, x1];
    }
    if (y1 > y2) {
      [y1, y2] = [y2, y1];
    }

    // Ensure coordinates are valid
    if (x1 >= x2 || y1 >= y2) {
      throw new Error(
        `Invalid bbox coordinates after normalization: [${x1}, ${y1}, ${x2}, ${y2}]`
      );
    }

    // Ensure coordinates are within image bounds
    x1 = Math.max(0, Math.min(x1, width - 1));
    y1 = Math.max(0, Math.min(y1, height - 1));
    x2 = Math.max(0, Math.min(x2, width));
    y2 = Math.max(0, Math.min(y2, height));

    const boxWidth = x2 - x1;
    const boxHeight = y2 - y1;

    // Create SVG red box (3px width)
    const svg = `
      <svg width="${width}" height="${height}">
        <rect x="${x1}" y="${y1}" width="${boxWidth}" height="${boxHeight}"
              fill="none" stroke="red" stroke-width="3"/>
        <text x="${x1 + 5}" y="${y1 - 8}" font-family="Arial" font-size="14"
              fill="red" font-weight="bold">${modelName}</text>
      </svg>
    `;

    // Overlay SVG on original image
    await image
      .composite([
        {
          input: Buffer.from(svg),
          top: 0,
          left: 0,
        },
      ])
      .toFile(outputPath);

    console.log(`✓ Saved annotated image: ${outputPath}`);
    console.log(
      `  BBox: [${x1}, ${y1}, ${x2}, ${y2}] (${boxWidth}x${boxHeight})`
    );
  } catch (error) {
    console.error(`✗ Failed to draw bbox for ${modelName}:`, error);
    throw error;
  }
}

/**
 * Write content to TEST_REPORT.md
 */
function writeToReport(content: string): void {
  const reportPath = path.join(__dirname, 'TEST_REPORT.md');
  fs.appendFileSync(reportPath, content + '\n', 'utf-8');
}

/**
 * Initialize TEST_REPORT.md
 */
function initializeReport(): void {
  const reportPath = path.join(__dirname, 'TEST_REPORT.md');
  const header = `# Model Benchmark Test Report

**Test Date:** ${new Date().toLocaleString()}
**Test Type:** Automation Testing - Click Action Recognition

---

## Summary

| Model Name | Duration(ms) | Status | Accuracy Score | Annotated Image |
|------------|--------------|--------|----------------|-----------------|
<!-- SUMMARY_TABLE_ROWS -->

### Statistics

<!-- STATISTICS_SECTION -->

---

## Detailed Results

`;
  fs.writeFileSync(reportPath, header, 'utf-8');
}

/**
 * Update summary table in TEST_REPORT.md with actual results
 */
function updateSummaryTable(results: TestResult[]): void {
  const reportPath = path.join(__dirname, 'TEST_REPORT.md');
  let content = fs.readFileSync(reportPath, 'utf-8');

  // Sort results by accuracy score (descending), failed models go to the end
  const sortedResults = [...results].sort((a, b) => {
    const scoreA = a.error ? -1 : a.judgeResult || 0;
    const scoreB = b.error ? -1 : b.judgeResult || 0;
    return scoreB - scoreA;
  });

  // Generate summary table rows
  const tableRows = sortedResults
    .map((result) => {
      const status = result.error ? '❌ Failed' : '✅ Success';
      const accuracy =
        result.judgeResult !== undefined ? `${result.judgeResult}%` : 'N/A';
      const annotatedImage = result.annotatedImagePath
        ? `[View](${path.relative(__dirname, result.annotatedImagePath).replace(/\\/g, '/')})`
        : 'N/A';
      return `| ${result.modelName} | ${result.duration} | ${status} | ${accuracy} | ${annotatedImage} |`;
    })
    .join('\n');

  // Replace placeholder with actual rows and remove the placeholder
  if (content.includes('<!-- SUMMARY_TABLE_ROWS -->')) {
    content = content.replace('<!-- SUMMARY_TABLE_ROWS -->', tableRows);
  }

  // Calculate statistics
  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;
  const avgAccuracyScore =
    results.reduce((sum, r) => sum + (r.judgeResult || 0), 0) / results.length;
  const highAccuracyCount = results.filter(
    (r) => (r.judgeResult || 0) >= 70
  ).length;
  const avgDuration =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const minDuration = Math.min(...results.map((r) => r.duration));
  const maxDuration = Math.max(...results.map((r) => r.duration));

  // Generate statistics section
  const statisticsSection = `- **Total**: ${results.length} models
- **Success**: ${successCount} (${((successCount / results.length) * 100).toFixed(1)}%)
- **Failed**: ${failCount}
- **High Accuracy (≥70%)**: ${highAccuracyCount} (${((highAccuracyCount / results.length) * 100).toFixed(1)}%)
- **Avg Accuracy Score**: ${avgAccuracyScore.toFixed(1)}%
- **Average Duration**: ${avgDuration.toFixed(2)}ms
- **Min Duration**: ${minDuration}ms
- **Max Duration**: ${maxDuration}ms`;

  // Replace placeholder with actual statistics and remove the placeholder
  if (content.includes('<!-- STATISTICS_SECTION -->')) {
    content = content.replace('<!-- STATISTICS_SECTION -->', statisticsSection);
  }

  fs.writeFileSync(reportPath, content, 'utf-8');
}

/**
 * Test a single model
 */
async function testModel(
  model: ModelConfig,
  imageBase64: string,
  prompt: string,
  mimeType: string,
  originalImagePath: string,
  imageWidth: number,
  imageHeight: number
): Promise<TestResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const separator = `\n${'='.repeat(60)}`;
    const testingMsg = `Testing: ${model.name}`;

    console.log(separator);
    console.log(testingMsg);
    console.log('='.repeat(60));

    writeToReport(`${separator}\n## ${model.name}\n`);
    writeToReport(`**Started at:** ${new Date().toLocaleString()}\n`);

    const response = await callModelAPI(
      model,
      imageBase64,
      prompt,
      mimeType,
      imageWidth,
      imageHeight
    );
    const duration = Date.now() - startTime;

    const successMsg = `✓ Completed in ${duration}ms`;
    const responseMsg = `\nResponse:\n${response}\n==========`;

    console.log(successMsg);
    console.log(responseMsg);

    // Parse bbox coordinates
    const bboxData = parseBBoxFromResponse(response);
    let bbox: number[] | undefined;

    if (bboxData) {
      bbox = bboxData.bbox_2d;
      console.log(`✓ Parsed bbox: [${bbox.join(', ')}]`);
      console.log(`✓ Target: ${bboxData.target}`);

      // Draw annotated image and save to output folder
      const outputDir = path.join(__dirname, 'output');
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const annotatedImageName = `${model.name.replace(/[^a-zA-Z0-9]/g, '_')}_annotated.png`;
      const annotatedImagePath = path.join(outputDir, annotatedImageName);
      await drawBBoxOnImage(
        originalImagePath,
        bbox,
        annotatedImagePath,
        model.name,
        model.coordType
      );

      writeToReport(`**BBox:** [${bbox.join(', ')}]`);
      writeToReport(`**Target:** ${bboxData.target}`);
      writeToReport(
        `**Annotated Image:** [${annotatedImageName}](output/${annotatedImageName})`
      );

      // Use judge model to evaluate annotation result
      const judgeResult = await judgeAnnotation(annotatedImagePath, model.name);
      writeToReport(`**Accuracy Score:** ${judgeResult}%`);

      writeToReport(`**Status:** ✅ Success`);
      writeToReport(`**Duration:** ${duration}ms`);
      writeToReport(`**Response:**\n\`\`\`\n${response}\n\`\`\`\n`);

      return {
        modelName: model.name,
        response,
        duration,
        timestamp,
        bbox,
        judgeResult,
        annotatedImagePath,
      };
    } else {
      console.log('⚠ No valid bbox found in response');
      writeToReport(`**BBox:** Not found or invalid format`);
      writeToReport(`**Judge Result:** ❌ No bbox to judge`);

      writeToReport(`**Status:** ✅ Success`);
      writeToReport(`**Duration:** ${duration}ms`);
      writeToReport(`**Response:**\n\`\`\`\n${response}\n\`\`\`\n`);

      return {
        modelName: model.name,
        response,
        duration,
        timestamp,
        bbox,
        judgeResult: 0,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;
      console.error(`✗ Failed (${model.name}): ${errorMessage}`);
    }

    writeToReport(`**Status:** ❌ Failed`);
    writeToReport(`**Duration:** ${duration}ms`);
    writeToReport(`**Error:** ${errorMessage}\n`);

    return {
      modelName: model.name,
      response: '',
      duration,
      timestamp,
      error: errorMessage,
      judgeResult: 0,
    };
  }
}

/**
 * Print summary table
 */
function printSummary(results: TestResult[]): void {
  const separator = '\n' + '='.repeat(60);
  const summaryTitle = 'BENCHMARK SUMMARY';

  console.log(separator);
  console.log(summaryTitle);
  console.log(separator);

  console.log('\n📊 Results:\n');
  results.forEach((result) => {
    const status = result.error ? '❌ Failed' : '✅ Success';
    const duration = `${result.duration}ms`;
    const judgeStatus =
      result.judgeResult !== undefined ? `${result.judgeResult}%` : 'N/A';
    console.log(
      `  ${result.modelName}: ${status} (${duration}) - Judge: ${judgeStatus}`
    );
  });

  console.log(`\n📈 Statistics:\n`);
  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;
  const avgAccuracyScore =
    results.reduce((sum, r) => sum + (r.judgeResult || 0), 0) / results.length;
  const highAccuracyCount = results.filter(
    (r) => (r.judgeResult || 0) >= 70
  ).length;
  const avgDuration =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  console.log(`  Total: ${results.length} models`);
  console.log(
    `  Success: ${successCount} (${((successCount / results.length) * 100).toFixed(1)}%)`
  );
  console.log(`  Failed: ${failCount}`);
  console.log(
    `  High Accuracy (≥70%): ${highAccuracyCount} (${((highAccuracyCount / results.length) * 100).toFixed(1)}%)`
  );
  console.log(`  Avg Accuracy Score: ${avgAccuracyScore.toFixed(1)}%`);
  console.log(`  Average Duration: ${avgDuration.toFixed(2)}ms`);
  console.log(
    `  Min Duration: ${Math.min(...results.map((r) => r.duration))}ms`
  );
  console.log(
    `  Max Duration: ${Math.max(...results.map((r) => r.duration))}ms`
  );

  console.log(`\n---`);
}

/**
 * Main benchmark function
 */
async function runBenchmark(): Promise<void> {
  const args = process.argv.slice(2);
  const imagePath = args[0] || path.join(__dirname, 'image.png');

  // Validate image file exists
  if (!fs.existsSync(imagePath)) {
    console.error(`Error: Image file not found: ${imagePath}`);
    console.log('\nUsage: npx tsx benchmark_model.ts <path-to-image>');
    console.log('   or: npm run benchmark -- <path-to-image>');
    process.exit(1);
  }

  const absoluteImagePath = path.resolve(imagePath);

  try {
    console.log('='.repeat(60));
    console.log('MODEL BENCHMARK TEST');
    console.log('='.repeat(60));
    console.log(`\nTest Image: ${absoluteImagePath}`);

    // Read image and get dimensions
    const imageBase64 = readImageAsBase64(absoluteImagePath);
    const mimeType = getMimeType(absoluteImagePath);
    const imageInfo = await sharp(absoluteImagePath).metadata();
    const imageWidth = imageInfo.width || 0;
    const imageHeight = imageInfo.height || 0;

    console.log(`Image Size: ${imageWidth}x${imageHeight}`);
    console.log(`Models to Test: ${MODELS.length}`);
    console.log(`List: ${MODELS.map((m) => m.name).join(', ')}`);

    // Generate test prompt
    const testPrompt = generateTestPrompt(imageWidth, imageHeight);

    // Initialize report
    initializeReport();

    // Test all models concurrently
    const results = await Promise.all(
      MODELS.map((model) =>
        testModel(
          model,
          imageBase64,
          testPrompt,
          mimeType,
          absoluteImagePath,
          imageWidth,
          imageHeight
        )
      )
    );

    // Print summary
    printSummary(results);

    // Update summary table in report
    updateSummaryTable(results);

    console.log(`\n✓ Benchmark completed!`);
    console.log(`  Report saved to: TEST_REPORT.md`);
    console.log(`  Annotated images saved to: output/ folder`);
  } catch (error) {
    console.error('\n✗ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run the benchmark
try {
  await runBenchmark();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}
