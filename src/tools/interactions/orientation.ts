import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getOrientation as _getOrientation,
  setOrientation as _setOrientation,
} from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

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
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        if (args.action === 'get') {
          const currentOrientation = await _getOrientation(driver);
          return textResult(
            `Successfully got orientation: ${currentOrientation}`
          );
        }

        if (!args.orientation) {
          return errorResult('orientation is required when action is set');
        }

        await _setOrientation(driver, args.orientation);
        return textResult(
          `Successfully set orientation to ${args.orientation}`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to ${args.action} orientation. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
