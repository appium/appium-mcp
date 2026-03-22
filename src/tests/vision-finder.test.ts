/**
 * Unit tests for AIVisionFinder
 *
 * Mock strategy:
 * - axios.post: spied on via jest.spyOn to avoid real HTTP requests
 * - @appium/support imageUtil: mocked via __mocks__/@appium/support.ts
 * - Screenshot input: benchmark image.png read as base64
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import axios, { AxiosError } from 'axios';
import { mockSharpInstance } from './__mocks__/@appium/support.js';

// ─── Resolve paths ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read the benchmark screenshot (image.png) as a base64 string.
 * This is the same image used by benchmark_model.ts, representing
 * a realistic mobile UI screenshot.
 */
const BENCHMARK_IMAGE_PATH = join(__dirname, 'benchmark_model', 'image.png');
const BENCHMARK_IMAGE_BASE64 =
  readFileSync(BENCHMARK_IMAGE_PATH).toString('base64');

// Realistic image dimensions matching the benchmark screenshot
const IMAGE_WIDTH = 1080;
const IMAGE_HEIGHT = 2400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAxiosResponse(content: string) {
  return {
    data: {
      choices: [{ message: { content } }],
    },
  };
}

/**
 * Create a spy implementation that resolves with the given model response content
 * and prints it to the test log, simulating what a real API call would return.
 */
function mockModelResponse(content: string) {
  const response = buildAxiosResponse(content);
  return jest.fn().mockImplementation(() => {
    console.log(`\n[Model Response]\n${content}\n`);
    return Promise.resolve(response);
  });
}

function jsonBBoxResponse(
  target: string,
  bbox: [number, number, number, number]
): string {
  return `action: **CLICK**\nParameters: {"target": "${target}", "bbox_2d": [${bbox.join(', ')}]}`;
}

function arrayBBoxResponse(bbox: [number, number, number, number]): string {
  return `The element is located at [${bbox.join(', ')}]`;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AIVisionFinder', () => {
  const originalEnv = { ...process.env };
  let postSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    postSpy = jest.spyOn(axios, 'post');

    process.env.AI_VISION_API_BASE_URL = 'https://mock-api.example.com/v1';
    process.env.AI_VISION_API_KEY = 'mock-token-12345';
    process.env.AI_VISION_MODEL = 'Qwen3-VL-235B-A22B-Instruct';
    process.env.AI_VISION_COORD_TYPE = 'normalized';
    process.env.AI_VISION_IMAGE_MAX_WIDTH = '1080';
    process.env.AI_VISION_IMAGE_QUALITY = '80';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  // ── Constructor ─────────────────────────────────────────────────────────────

  describe('constructor', () => {
    test('should throw when AI_VISION_API_BASE_URL is missing', async () => {
      delete process.env.AI_VISION_API_BASE_URL;
      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      expect(() => new AIVisionFinder()).toThrow(
        'AI_VISION_API_BASE_URL environment variable is required for AI vision finding'
      );
    });

    test('should throw when AI_VISION_API_KEY is missing', async () => {
      delete process.env.AI_VISION_API_KEY;
      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      expect(() => new AIVisionFinder()).toThrow(
        'AI_VISION_API_KEY environment variable is required for AI vision finding'
      );
    });

    test('should initialize successfully when all required env vars are set', async () => {
      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      expect(() => new AIVisionFinder()).not.toThrow();
    });
  });

  // ── findElement – JSON bbox format (normalized) ──────────────────────────────

  describe('findElement – JSON bbox format (normalized coordinates)', () => {
    test('should return correct bbox, center and target for a typical search button', async () => {
      const normalizedBBox: [number, number, number, number] = [
        800, 50, 950, 120,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Search', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result.target).toBe('Search');
      // Normalized → absolute:
      // x1 = floor(800/1000 * 1080) = 864
      // y1 = floor(50/1000  * 2400) = 120
      // x2 = floor(950/1000 * 1080) = 1026
      // y2 = floor(120/1000 * 2400) = 288
      expect(result.bbox).toEqual([864, 120, 1026, 288]);
      // center: floor((864+1026)/2)=945, floor((120+288)/2)=204
      expect(result.center).toEqual({ x: 945, y: 204 });
    });

    test('should call axios.post with correct endpoint and authorization header', async () => {
      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Click me button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [url, _body, config] = postSpy.mock.calls[0] as [
        string,
        unknown,
        { headers: Record<string, string> },
      ];
      expect(url).toBe('https://mock-api.example.com/v1/chat/completions');
      expect(config.headers.Authorization).toBe('Bearer mock-token-12345');
    });

    test('should send image as JPEG base64 data URL in the request body', async () => {
      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Icon', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Home icon',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      const [_url, body] = postSpy.mock.calls[0] as [
        string,
        {
          messages: Array<{
            content: Array<{ type: string; image_url?: { url: string } }>;
          }>;
        },
      ];
      const imageContent = body.messages[0].content.find(
        (c) => c.type === 'image_url'
      );
      expect(imageContent).toBeDefined();
      expect(imageContent!.image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  // ── findElement – array bbox format ─────────────────────────────────────────

  describe('findElement – array bbox format (normalized coordinates)', () => {
    test('should parse array format bbox and return correct result', async () => {
      const normalizedBBox: [number, number, number, number] = [
        200, 300, 400, 500,
      ];
      postSpy.mockImplementation(
        mockModelResponse(arrayBBoxResponse(normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Login button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      // x1=floor(200/1000*1080)=216, y1=floor(300/1000*2400)=720
      // x2=floor(400/1000*1080)=432, y2=floor(500/1000*2400)=1200
      expect(result.bbox).toEqual([216, 720, 432, 1200]);
      expect(result.target).toBe('Detected element');
      expect(result.center).toEqual({ x: 324, y: 960 });
    });
  });

  // ── Absolute coordinate mode ─────────────────────────────────────────────────

  describe('findElement – absolute coordinate mode', () => {
    test('should use absolute pixel coordinates directly without conversion', async () => {
      process.env.AI_VISION_COORD_TYPE = 'absolute';

      const absoluteBBox: [number, number, number, number] = [
        100, 200, 400, 350,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Submit', absoluteBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Submit button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result.bbox).toEqual([100, 200, 400, 350]);
      expect(result.center).toEqual({ x: 250, y: 275 });
      expect(result.target).toBe('Submit');
    });
  });

  // ── Coordinate boundary clamping ─────────────────────────────────────────────

  describe('findElement – coordinate boundary clamping', () => {
    test('should clamp coordinates that exceed image boundaries (absolute mode)', async () => {
      process.env.AI_VISION_COORD_TYPE = 'absolute';

      const outOfBoundsBBox: [number, number, number, number] = [
        0, 0, 1200, 2600,
      ];
      postSpy.mockImplementation(
        mockModelResponse(
          jsonBBoxResponse('Full screen', outOfBoundsBBox)
        ) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Full screen element',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result.bbox[0]).toBeGreaterThanOrEqual(0);
      expect(result.bbox[1]).toBeGreaterThanOrEqual(0);
      expect(result.bbox[2]).toBeLessThanOrEqual(IMAGE_WIDTH);
      expect(result.bbox[3]).toBeLessThanOrEqual(IMAGE_HEIGHT);
    });
  });

  // ── Coordinate order correction ──────────────────────────────────────────────

  describe('findElement – coordinate order correction', () => {
    test('should swap x1/x2 when x1 > x2 (absolute mode)', async () => {
      process.env.AI_VISION_COORD_TYPE = 'absolute';

      const reversedXBBox: [number, number, number, number] = [
        500, 100, 200, 300,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Element', reversedXBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Some element',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result.bbox[0]).toBeLessThan(result.bbox[2]);
    });

    test('should swap y1/y2 when y1 > y2 (absolute mode)', async () => {
      process.env.AI_VISION_COORD_TYPE = 'absolute';

      const reversedYBBox: [number, number, number, number] = [
        100, 600, 400, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Element', reversedYBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Some element',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result.bbox[1]).toBeLessThan(result.bbox[3]);
    });
  });

  // ── API error handling ───────────────────────────────────────────────────────

  describe('findElement – API error handling', () => {
    test('should throw with HTTP status code when API returns 401', async () => {
      const axiosError = new AxiosError(
        'Request failed with status code 401',
        '401',
        undefined,
        undefined,
        {
          status: 401,
          data: { error: { message: 'Unauthorized: invalid API token' } },
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        }
      );
      postSpy.mockRejectedValue(axiosError);

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await expect(
        finder.findElement(
          BENCHMARK_IMAGE_BASE64,
          'Search button',
          IMAGE_WIDTH,
          IMAGE_HEIGHT
        )
      ).rejects.toThrow(/Vision API call failed.*HTTP 401/);
    });

    test('should throw with HTTP status code when API returns 429 (rate limit)', async () => {
      const axiosError = new AxiosError(
        'Request failed with status code 429',
        '429',
        undefined,
        undefined,
        {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } },
          statusText: 'Too Many Requests',
          headers: {},
          config: {} as any,
        }
      );
      postSpy.mockRejectedValue(axiosError);

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await expect(
        finder.findElement(
          BENCHMARK_IMAGE_BASE64,
          'Search button',
          IMAGE_WIDTH,
          IMAGE_HEIGHT
        )
      ).rejects.toThrow(/Vision API call failed.*HTTP 429/);
    });

    test('should rethrow non-Axios errors as-is', async () => {
      const networkError = new Error('Network timeout');
      postSpy.mockRejectedValue(networkError);

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await expect(
        finder.findElement(
          BENCHMARK_IMAGE_BASE64,
          'Search button',
          IMAGE_WIDTH,
          IMAGE_HEIGHT
        )
      ).rejects.toThrow('Network timeout');
    });
  });

  // ── Unparseable model response ───────────────────────────────────────────────

  describe('findElement – unparseable model response', () => {
    test('should throw when model response contains no valid bbox', async () => {
      postSpy.mockImplementation(
        mockModelResponse(
          'I cannot find the element you are looking for.'
        ) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await expect(
        finder.findElement(
          BENCHMARK_IMAGE_BASE64,
          'Search button',
          IMAGE_WIDTH,
          IMAGE_HEIGHT
        )
      ).rejects.toThrow('Failed to parse bbox from vision model response');
    });

    test('should throw when model response has malformed JSON bbox (missing bbox_2d)', async () => {
      const malformedResponse =
        'Parameters: {"target": "Search", "coordinates": [100, 200]}';
      postSpy.mockImplementation(mockModelResponse(malformedResponse) as any);

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await expect(
        finder.findElement(
          BENCHMARK_IMAGE_BASE64,
          'Search button',
          IMAGE_WIDTH,
          IMAGE_HEIGHT
        )
      ).rejects.toThrow('Failed to parse bbox from vision model response');
    });
  });

  // ── Image compression ────────────────────────────────────────────────────────

  describe('findElement – image compression', () => {
    test('should compress image when width exceeds imageMaxWidth and still return valid result', async () => {
      // Force resize branch: imageMaxWidth=100 < IMAGE_WIDTH=1080
      process.env.AI_VISION_IMAGE_MAX_WIDTH = '100';

      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockResolvedValue(
        buildAxiosResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result).toBeDefined();
      expect(result.bbox).toHaveLength(4);
      expect(result.center).toHaveProperty('x');
      expect(result.center).toHaveProperty('y');
    });

    test('should succeed without resize when image width is within imageMaxWidth limit', async () => {
      process.env.AI_VISION_IMAGE_MAX_WIDTH = '2000';

      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result).toBeDefined();
      expect(result.bbox).toHaveLength(4);
    });
  });

  // ── Image compression – resize actually called ──────────────────────────────

  describe('findElement – image compression (resize verification)', () => {
    beforeEach(() => {
      // Reset shared sharp mock state before each test in this group
      mockSharpInstance.reset();
    });

    test('should call sharp resize when image width exceeds imageMaxWidth', async () => {
      process.env.AI_VISION_IMAGE_MAX_WIDTH = '100';

      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH, // 1080 > 100, resize must be triggered
        IMAGE_HEIGHT
      );

      // Verify resize was called with the correct scaled dimensions:
      // scaleFactor = 100 / 1080 ≈ 0.0926
      // newHeight = floor(2400 * 0.0926) = floor(222.2) = 222
      expect(mockSharpInstance.resizeCalls).toHaveLength(1);
      expect(mockSharpInstance.resizeCalls[0]).toEqual([100, 222]);
    });

    test('should NOT call sharp resize when image width is within imageMaxWidth', async () => {
      process.env.AI_VISION_IMAGE_MAX_WIDTH = '2000';

      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH, // 1080 < 2000, no resize
        IMAGE_HEIGHT
      );

      // resize should NOT have been called
      expect(mockSharpInstance.resizeCalls).toHaveLength(0);
    });

    test('should fall back to original image when sharp compression throws', async () => {
      // Make toBuffer throw to simulate compression failure
      mockSharpInstance.toBufferImpl = () =>
        Promise.reject(new Error('sharp: out of memory'));

      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      // Should NOT throw – compressImage catches the error and falls back to original
      const result = await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      expect(result).toBeDefined();
      expect(result.bbox).toHaveLength(4);

      // The image sent to the API should be the original base64 (fallback path)
      const [_url, body] = postSpy.mock.calls[0] as [
        string,
        {
          messages: Array<{
            content: Array<{ type: string; image_url?: { url: string } }>;
          }>;
        },
      ];
      const imageContent = body.messages[0].content.find(
        (c) => c.type === 'image_url'
      );
      // In fallback mode the original PNG base64 is used directly
      expect(imageContent!.image_url!.url).toContain('base64,');
    });
  });

  // ── convertCoordinates – invalid bbox after swap ─────────────────────────────

  describe('findElement – invalid bbox after coordinate processing', () => {
    test('should throw when bbox has zero width after clamping (x1 === x2, absolute mode)', async () => {
      process.env.AI_VISION_COORD_TYPE = 'absolute';

      // x1 === x2 after clamping: both at the right edge of the image
      // Use x1=1079, x2=1079 → after clamp x1=min(1079,1079)=1079, x2=min(1079,1080)=1079 → x1>=x2
      const zeroWidthBBox: [number, number, number, number] = [
        1079, 100, 1079, 300,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Edge', zeroWidthBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await expect(
        finder.findElement(
          BENCHMARK_IMAGE_BASE64,
          'Edge element',
          IMAGE_WIDTH,
          IMAGE_HEIGHT
        )
      ).rejects.toThrow(/Invalid bbox coordinates after conversion/);
    });
  });

  // ── Prompt content ───────────────────────────────────────────────────────────

  describe('findElement – prompt content', () => {
    test('should include the instruction and image dimensions in the prompt', async () => {
      const instruction = 'yellow search button at the top';
      const normalizedBBox: [number, number, number, number] = [
        100, 50, 300, 150,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Search', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        instruction,
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      const [_url, body] = postSpy.mock.calls[0] as [
        string,
        {
          messages: Array<{ content: Array<{ type: string; text?: string }> }>;
        },
      ];
      const textContent = body.messages[0].content.find(
        (c) => c.type === 'text'
      );
      expect(textContent).toBeDefined();
      expect(textContent!.text).toContain(instruction);
      expect(textContent!.text).toContain(String(IMAGE_WIDTH));
      expect(textContent!.text).toContain(String(IMAGE_HEIGHT));
    });

    test('should use the configured model name in the API request', async () => {
      process.env.AI_VISION_MODEL = 'custom-vision-model-v2';

      const normalizedBBox: [number, number, number, number] = [
        100, 100, 300, 200,
      ];
      postSpy.mockImplementation(
        mockModelResponse(jsonBBoxResponse('Button', normalizedBBox)) as any
      );

      const { AIVisionFinder } = await import('../ai-finder/vision-finder.js');
      const finder = new AIVisionFinder();

      await finder.findElement(
        BENCHMARK_IMAGE_BASE64,
        'Search button',
        IMAGE_WIDTH,
        IMAGE_HEIGHT
      );

      const [_url, body] = postSpy.mock.calls[0] as [string, { model: string }];
      expect(body.model).toBe('custom-vision-model-v2');
    });
  });
});
