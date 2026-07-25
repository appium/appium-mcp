import type { FastMCP } from 'fastmcp';
import { elementUUIDScheme } from '../../schema.js';
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
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export { resolveScreenshotDir };

export interface ScreenshotDeps {
  writeFile: (filePath: string, data: Buffer) => Promise<unknown>;
  mkdir: (
    dirPath: string,
    options?: { recursive?: boolean }
  ) => Promise<unknown>;
  resolveScreenshotDir: typeof resolveScreenshotDir;
  dateNow: () => number;
}

const defaultDeps: ScreenshotDeps = {
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

  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

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
    return addUIResourceToResponse(textResponse, () =>
      createUIResource(
        `ui://appium-mcp/screenshot-viewer/${Date.now()}`,
        createScreenshotViewerUI(displayBase64, filepath)
      )
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to take screenshot. err: ${toolErrorMessage(err)}`
    );
  }
}

const screenshotSchema = z.object({
  elementUUID: elementUUIDScheme
    .optional()
    .describe('Element-only capture; omit for full screen.'),
  maxWidth: z
    .number()
    .optional()
    .describe('Resize to this max width, preserving aspect ratio.'),
  returnRawBase64: z
    .boolean()
    .default(false)
    .describe(
      'Manual use only: return PNG inline instead of saving. LLMs must keep false and use the saved path.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

export default function screenshot(server: FastMCP): void {
  server.addTool({
    name: 'appium_screenshot',
    description: 'Save a full-screen or element PNG.',
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
