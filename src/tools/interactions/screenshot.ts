import type { FastMCP } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { NullableDriverInstance } from '../../session-store.js';
import { fs, imageUtil } from '@appium/support';
import { join } from 'node:path';
import {
  createUIResource,
  createScreenshotViewerUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { getScreenshot } from '../../command.js';
import z from 'zod';
import { resolveScreenshotDir } from '../../utils/paths.js';
import {
  textResult,
  errorResult,
  toolErrorMessage,
  noActiveDriverSessionResult,
} from '../tool-response.js';

export { resolveScreenshotDir };

export interface ScreenshotDeps {
  getDriver: (sessionId?: string) => NullableDriverInstance;
  writeFile: (filePath: string, data: Buffer) => Promise<unknown>;
  mkdir: (
    dirPath: string,
    options?: { recursive?: boolean }
  ) => Promise<unknown>;
  resolveScreenshotDir: typeof resolveScreenshotDir;
  dateNow: () => number;
}

const defaultDeps: ScreenshotDeps = {
  getDriver,
  writeFile: fs.writeFile,
  mkdir: async (dirPath) => await fs.mkdirp(dirPath),
  resolveScreenshotDir,
  dateNow: () => Date.now(),
};

export async function executeScreenshot(opts: {
  deps?: ScreenshotDeps;
  elementId?: string;
  maxWidth?: number;
  returnRawBase64?: boolean;
  sessionId?: string;
}): Promise<any> {
  const {
    deps = defaultDeps,
    elementId,
    maxWidth,
    returnRawBase64,
    sessionId,
  } = opts;

  const driver = deps.getDriver(sessionId);
  if (!driver) {
    return noActiveDriverSessionResult(sessionId);
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

    // Return the raw base64 image without touching the disk. Useful when the
    // server runs on a remote machine where the saved file is not reachable.
    if (returnRawBase64) {
      return {
        content: [
          {
            type: 'image',
            data: displayBase64,
            mimeType: 'image/png',
          },
        ],
      };
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

    const textResponse = textResult(
      `Screenshot saved successfully to: ${filepath}`
    );

    // Add interactive screenshot viewer UI
    const uiResource = createUIResource(
      `ui://appium-mcp/screenshot-viewer/${Date.now()}`,
      createScreenshotViewerUI(displayBase64, filepath)
    );

    return addUIResourceToResponse(textResponse, uiResource);
  } catch (err: unknown) {
    return errorResult(
      `Failed to take screenshot. err: ${toolErrorMessage(err)}`
    );
  }
}

const screenshotSchema = z.object({
  elementUUID: elementUUIDScheme
    .optional()
    .describe(
      'Optional element UUID. If provided, captures only this element. If omitted, captures full screen.'
    ),
  maxWidth: z
    .number()
    .optional()
    .describe(
      'Optional maximum width in pixels to resize the screenshot. The aspect ratio is preserved. Useful for reducing token usage when sending screenshots to LLMs.'
    ),
  returnRawBase64: z
    .boolean()
    .default(false)
    .describe(
      'When true, returns the raw base64-encoded PNG image instead of saving it to disk. ' +
        'This should only be enabled when a human explicitly invokes the tool manually, ' +
        'typically to view the screenshot on a different machine (e.g. when the server runs ' +
        'on a remote machine and the saved file is not accessible). ' +
        'An LLM must always keep this false and rely on the saved file path.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function screenshot(server: FastMCP): void {
  server.addTool({
    name: 'appium_screenshot',
    description:
      'Take a screenshot and save as PNG. Optionally provide elementUUID to capture only that element.',
    parameters: screenshotSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof screenshotSchema>, _context: any) =>
      executeScreenshot({
        elementId: args.elementUUID,
        maxWidth: args.maxWidth,
        returnRawBase64: args.returnRawBase64,
        sessionId: args.sessionId,
      }),
  });
}
