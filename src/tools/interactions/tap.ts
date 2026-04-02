import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { performActions } from '../../command.js';

export default function tap(server: FastMCP): void {
  const tapSchema = z.object({
    x: z.number().describe('X coordinate to tap on the screen'),
    y: z.number().describe('Y coordinate to tap on the screen'),
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_tap_by_coordinates',
    description:
      'Tap at specific screen coordinates (x, y). Use this when no element UUID is available or when you need to tap an area with no associated element. For elements returned by appium_find_element, prefer appium_click instead. On iOS, coordinates are in points (logical pixels). On Android, coordinates are in device pixels. Use appium_get_page_source to inspect element bounds for accurate coordinates.',
    parameters: tapSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof tapSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      const { x, y } = args;

      try {
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
