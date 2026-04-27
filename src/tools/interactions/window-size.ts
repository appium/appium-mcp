import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getWindowSize as cmdGetWindowSize } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export default function getWindowSize(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_window_size',
    description:
      'Get the width and height of the device screen in pixels. Useful for calculating coordinates for swipes, taps, and scrolls.',
    parameters: z.object({
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to target. If omitted, uses the active session.'),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: { sessionId?: string },
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const { width, height } = await cmdGetWindowSize(driver);
        return textResult(`Width: ${width}, Height: ${height}`);
      } catch (err: unknown) {
        return errorResult(
          `Failed to get window size. Error: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
