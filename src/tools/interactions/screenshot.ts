import { FastMCP } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { NullableDriverInstance } from '../../session-store.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createUIResource,
  createScreenshotViewerUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { getScreenshot } from '../../command.js';
import z from 'zod';
import { imageUtil } from '@appium/support';
import { resolveScreenshotDir } from '../../utils/paths.js';

export { resolveScreenshotDir };

export interface ScreenshotDeps {
  getDriver: () => NullableDriverInstance;
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

export async function executeScreenshot(opts: {
  deps?: ScreenshotDeps;
  elementId?;
  maxWidth?: number;
}): Promise<any> {
  const { deps = defaultDeps, elementId, maxWidth } = opts;

  const driver = deps.getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  try {
    const screenshotBase64 = await getScreenshot(driver, elementId);

    // Convert base64 to buffer
    const originalBuffer = Buffer.from(screenshotBase64, 'base64');

    // Resize if maxWidth is provided and image is wider
    let screenshotBuffer: Buffer = originalBuffer;
    let displayBase64 = screenshotBase64;
    if (maxWidth !== undefined) {
      const sharp = imageUtil.requireSharp();
      const metadata = await sharp(originalBuffer).metadata();
      if (metadata.width !== undefined && metadata.width > maxWidth) {
        const resizedBuffer = await sharp(originalBuffer)
          .resize({ width: maxWidth })
          .png()
          .toBuffer();
        screenshotBuffer = Buffer.from(resizedBuffer);
        displayBase64 = screenshotBuffer.toString('base64');
      }
    }

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
      createScreenshotViewerUI(displayBase64, filepath)
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

const maxWidthSchema = z
  .number()
  .optional()
  .describe(
    'Optional maximum width in pixels to resize the screenshot. The aspect ratio is preserved. Useful for reducing token usage when sending screenshots to LLMs.'
  );

export function screenshot(server: FastMCP): void {
  const screenshotSchema = z.object({
    maxWidth: maxWidthSchema,
  });

  server.addTool({
    name: 'appium_screenshot',
    description:
      'Take a screenshot of the current screen and return as PNG image',
    parameters: screenshotSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, _context: any): Promise<any> =>
      executeScreenshot({ maxWidth: args.maxWidth }),
  });
}

export function elementScreenshot(server: FastMCP): void {
  const elementScreenshotSchema = z.object({
    elementUUID: elementUUIDScheme,
    maxWidth: maxWidthSchema,
  });

  server.addTool({
    name: 'appium_element_screenshot',
    description:
      'Take a screenshot of the given element uuid and return as PNG image',
    parameters: elementScreenshotSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, _context: any): Promise<any> =>
      executeScreenshot({
        elementId: args.elementUUID,
        maxWidth: args.maxWidth,
      }),
  });
}
