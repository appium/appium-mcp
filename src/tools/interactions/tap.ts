import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute, performActions } from '../../command.js';

export default function tap(server: FastMCP): void {
  const tapSchema = z.object({
    x: z.number().describe('X coordinate to tap on the screen'),
    y: z.number().describe('Y coordinate to tap on the screen'),
  });

  server.addTool({
    name: 'appium_tap',
    description:
      'Tap at specific screen coordinates (x, y). Use this when you need to tap a location on screen without finding an element first.',
    parameters: tapSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof tapSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      const { x, y } = args;

      try {
        const platform = getPlatformName(driver);

        if (platform === PLATFORM.ios) {
          await execute(driver, 'mobile: tap', { x, y });
        } else if (platform === PLATFORM.android) {
          const operation = [
            {
              type: 'pointer',
              id: 'finger1',
              parameters: { pointerType: 'touch' },
              actions: [
                { type: 'pointerMove', duration: 0, x, y },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 50 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ];
          await performActions(driver, operation);
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully tapped at coordinates (${x}, ${y})`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to tap at coordinates (${x}, ${y}). Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
