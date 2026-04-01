import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { getWindowSize as cmdGetWindowSize } from '../../command.js';

export default function getWindowSize(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_window_size',
    description:
      'Get the width and height of the device screen in pixels. Useful for calculating coordinates for swipes, taps, and scrolls.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      _args: Record<string, never>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const { width, height } = await cmdGetWindowSize(driver);
        return {
          content: [
            { type: 'text', text: `Width: ${width}, Height: ${height}` },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get window size. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
