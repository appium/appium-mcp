import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { getDriver, isRemoteDriverSession } from '../../session-store.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, isAbsolute } from 'path';
import {
  createUIResource,
  createScreenshotViewerUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import type { Client } from 'webdriver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';

/**
 * Resolves the screenshot directory path.
 * - If SCREENSHOTS_DIR is not set, returns process.cwd()
 * - If SCREENSHOTS_DIR is absolute, returns it as-is
 * - If SCREENSHOTS_DIR is relative, joins it with process.cwd()
 */
export function resolveScreenshotDir(): string {
  const screenshotDir = process.env.SCREENSHOTS_DIR;

  if (!screenshotDir) {
    return process.cwd();
  }

  if (isAbsolute(screenshotDir)) {
    return screenshotDir;
  }

  return join(process.cwd(), screenshotDir);
}

export interface ScreenshotDeps {
  getDriver: () => Client | AndroidUiautomator2Driver | XCUITestDriver | null;
  writeFile: typeof writeFile;
  mkdir: typeof mkdir;
  resolveScreenshotDir: typeof resolveScreenshotDir;
  dateNow: () => number;
}

const defaultDeps: ScreenshotDeps = {
  getDriver,
  writeFile,
  mkdir,
  resolveScreenshotDir,
  dateNow: () => Date.now(),
};

export async function executeScreenshot(
  deps: ScreenshotDeps = defaultDeps
): Promise<any> {
  const driver = deps.getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  try {
    const screenshotBase64 = isRemoteDriverSession(driver)
      ? await (driver as Client).takeScreenshot()
      : await (driver as any).getScreenshot();

    // Convert base64 to buffer
    const screenshotBuffer = Buffer.from(screenshotBase64, 'base64');

    // Generate filename with timestamp
    const timestamp = deps.dateNow();
    const filename = `screenshot_${timestamp}.png`;
    const screenshotDir = deps.resolveScreenshotDir();

    // Create a directory if it doesn't exist
    await deps.mkdir(screenshotDir, { recursive: true });

    const filepath = join(screenshotDir, filename);

    // Save screenshot to disk
    await deps.writeFile(filepath, screenshotBuffer);

    const textResponse = {
      content: [
        {
          type: 'text',
          text: `Screenshot saved successfully to: ${filepath}`,
        },
      ],
    };

    // Add interactive screenshot viewer UI
    const uiResource = createUIResource(
      `ui://appium-mcp/screenshot-viewer/${Date.now()}`,
      createScreenshotViewerUI(screenshotBase64, filepath)
    );

    return addUIResourceToResponse(textResponse, uiResource);
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

export default function screenshot(server: FastMCP): void {
  server.addTool({
    name: 'appium_screenshot',
    description:
      'Take a screenshot of the current screen and return as PNG image',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (): Promise<any> => executeScreenshot(),
  });
}
