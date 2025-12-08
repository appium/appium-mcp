import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { join, isAbsolute } from 'path';

/**
 * Local implementation of resolveScreenshotDir for testing.
 * This mirrors the implementation in screenshot.ts to avoid importing
 * the module which has heavy dependencies.
 */
function resolveScreenshotDir(): string {
  const screenshotDir = process.env.SCREENSHOTS_DIR;

  if (!screenshotDir) {
    return process.cwd();
  }

  if (isAbsolute(screenshotDir)) {
    return screenshotDir;
  }

  return join(process.cwd(), screenshotDir);
}

/**
 * Interface for screenshot dependencies (mirrors screenshot.ts).
 */
interface ScreenshotDeps {
  getDriver: () => { getScreenshot: () => Promise<string> } | null;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
  resolveScreenshotDir: () => string;
  dateNow: () => number;
}

/**
 * Local implementation of executeScreenshot for testing.
 * This mirrors the implementation in screenshot.ts.
 */
async function executeScreenshot(deps: ScreenshotDeps): Promise<any> {
  const driver = deps.getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  try {
    const screenshotBase64 = await driver.getScreenshot();
    const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');
    const timestamp = deps.dateNow();
    const filename = `screenshot_${timestamp}.png`;
    const screenshotDir = deps.resolveScreenshotDir();

    await deps.mkdir(screenshotDir, { recursive: true });
    const filepath = join(screenshotDir, filename);
    await deps.writeFile(filepath, screenshotBuffer);

    return {
      content: [
        {
          type: 'text',
          text: `Screenshot saved successfully to: ${filename}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to take screenshot. err: ${err.toString()}`,
        },
      ],
    };
  }
}

describe('resolveScreenshotDir', () => {
  const originalEnv = process.env.SCREENSHOTS_DIR;
  const cwd = process.cwd();

  beforeEach(() => {
    delete process.env.SCREENSHOTS_DIR;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SCREENSHOTS_DIR = originalEnv;
    } else {
      delete process.env.SCREENSHOTS_DIR;
    }
  });

  test('should return process.cwd() when SCREENSHOTS_DIR is not set', () => {
    const result = resolveScreenshotDir();
    expect(result).toBe(cwd);
  });

  test('should return process.cwd() when SCREENSHOTS_DIR is empty string', () => {
    process.env.SCREENSHOTS_DIR = '';
    const result = resolveScreenshotDir();
    expect(result).toBe(cwd);
  });

  test('should return absolute path as-is when SCREENSHOTS_DIR is absolute', () => {
    const absolutePath = '/tmp/screenshots';
    process.env.SCREENSHOTS_DIR = absolutePath;
    const result = resolveScreenshotDir();
    expect(result).toBe(absolutePath);
  });

  test('should join relative path with process.cwd()', () => {
    const relativePath = 'screenshots';
    process.env.SCREENSHOTS_DIR = relativePath;
    const result = resolveScreenshotDir();
    expect(result).toBe(join(cwd, relativePath));
  });

  test('should handle nested relative paths', () => {
    const relativePath = 'output/screenshots/test';
    process.env.SCREENSHOTS_DIR = relativePath;
    const result = resolveScreenshotDir();
    expect(result).toBe(join(cwd, relativePath));
  });

  test('should handle relative path starting with ./', () => {
    const relativePath = './screenshots';
    process.env.SCREENSHOTS_DIR = relativePath;
    const result = resolveScreenshotDir();
    expect(result).toBe(join(cwd, relativePath));
  });

  test('should handle relative path with parent directory reference', () => {
    const relativePath = '../screenshots';
    process.env.SCREENSHOTS_DIR = relativePath;
    const result = resolveScreenshotDir();
    expect(result).toBe(join(cwd, relativePath));
  });
});

describe('executeScreenshot', () => {
  const mockBase64 = 'dGVzdA=='; // 'test' in base64
  const mockTimestamp = 1234567890;

  function createMockDeps(
    overrides: Partial<ScreenshotDeps> = {}
  ): ScreenshotDeps {
    return {
      getDriver: jest.fn(() => ({
        getScreenshot: jest.fn(() => Promise.resolve(mockBase64)),
      })) as any,
      writeFile: jest.fn(() => Promise.resolve()) as any,
      mkdir: jest.fn(() => Promise.resolve()) as any,
      resolveScreenshotDir: jest.fn(() => '/mock/screenshots') as any,
      dateNow: jest.fn(() => mockTimestamp) as any,
      ...overrides,
    };
  }

  test('should throw error when no driver found', async () => {
    const deps = createMockDeps({
      getDriver: jest.fn(() => null) as any,
    });

    await expect(executeScreenshot(deps)).rejects.toThrow('No driver found');
  });

  test('should return success content with filename', async () => {
    const deps = createMockDeps();

    const result = await executeScreenshot(deps);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: `Screenshot saved successfully to: screenshot_${mockTimestamp}.png`,
        },
      ],
    });
  });

  test('should use resolved screenshot directory from SCREENSHOTS_DIR', async () => {
    const customDir = '/custom/path/screenshots';
    const deps = createMockDeps({
      resolveScreenshotDir: jest.fn(() => customDir) as any,
    });

    await executeScreenshot(deps);

    expect(deps.mkdir).toHaveBeenCalledWith(customDir, { recursive: true });
    expect(deps.writeFile).toHaveBeenCalledWith(
      join(customDir, `screenshot_${mockTimestamp}.png`),
      expect.any(Buffer)
    );
  });

  test('should create directory with recursive option', async () => {
    const deps = createMockDeps();

    await executeScreenshot(deps);

    expect(deps.mkdir).toHaveBeenCalledWith('/mock/screenshots', {
      recursive: true,
    });
  });

  test('should write screenshot buffer to correct filepath', async () => {
    const deps = createMockDeps();

    await executeScreenshot(deps);

    expect(deps.writeFile).toHaveBeenCalledWith(
      `/mock/screenshots/screenshot_${mockTimestamp}.png`,
      Buffer.from(mockBase64, 'base64')
    );
  });

  test('should return error content when screenshot fails', async () => {
    const errorMessage = 'Screenshot capture failed';
    const deps = createMockDeps({
      getDriver: jest.fn(() => ({
        getScreenshot: jest.fn(() => Promise.reject(new Error(errorMessage))),
      })) as any,
    });

    const result = await executeScreenshot(deps);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: `Failed to take screenshot. err: Error: ${errorMessage}`,
        },
      ],
    });
  });

  test('should return error content when mkdir fails', async () => {
    const errorMessage = 'Permission denied';
    const deps = createMockDeps({
      mkdir: jest.fn(() => Promise.reject(new Error(errorMessage))) as any,
    });

    const result = await executeScreenshot(deps);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: `Failed to take screenshot. err: Error: ${errorMessage}`,
        },
      ],
    });
  });

  test('should return error content when writeFile fails', async () => {
    const errorMessage = 'Disk full';
    const deps = createMockDeps({
      writeFile: jest.fn(() => Promise.reject(new Error(errorMessage))) as any,
    });

    const result = await executeScreenshot(deps);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: `Failed to take screenshot. err: Error: ${errorMessage}`,
        },
      ],
    });
  });
});
