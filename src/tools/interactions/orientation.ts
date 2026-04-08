import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import {
  getOrientation as _getOrientation,
  setOrientation as _setOrientation,
} from '../../command.js';

const orientationSchema = z.object({
  action: z
    .enum(['get', 'set'])
    .describe(
      'Use get to read current orientation, set to change orientation.'
    ),
  orientation: z
    .enum(['LANDSCAPE', 'PORTRAIT'])
    .optional()
    .describe('Required when action is set.'),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function orientation(server: FastMCP): void {
  server.addTool({
    name: 'appium_orientation',
    description:
      'Get or set the device/screen orientation. Supports action=get and action=set (LANDSCAPE or PORTRAIT).',
    parameters: orientationSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof orientationSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        if (args.action === 'get') {
          const currentOrientation = await _getOrientation(driver);
          return {
            content: [
              {
                type: 'text',
                text: `Successfully got orientation: ${currentOrientation}`,
              },
            ],
          };
        }

        if (!args.orientation) {
          throw new Error('orientation is required when action is set');
        }

        await _setOrientation(driver, args.orientation);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set orientation to ${args.orientation}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to ${args.action} orientation. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
