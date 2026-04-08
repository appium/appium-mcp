import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import { setValue as _setValue } from '../../command.js';

export default function setValue(server: FastMCP): void {
  const setValueSchema = z
    .object({
      elementUUID: elementUUIDScheme.optional(),
      text: z.string().describe('The text to enter'),
      w3cActions: z
        .boolean()
        .optional()
        .describe(
          'When true, type text via the W3C Actions API (performActions) instead of ' +
            'the driver-specific setValue. No elementUUID needed — key events are sent ' +
            'to whatever element currently has focus. Works on both Android and iOS.'
        ),
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to target. If omitted, uses the active session.'),
    })
    .refine((v) => v.w3cActions === true || v.elementUUID !== undefined, {
      message: 'elementUUID is required when w3cActions is not true',
    });

  server.addTool({
    name: 'appium_set_value',
    description: 'Enter text into an element',
    parameters: setValueSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof setValueSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        await _setValue(
          driver,
          args.elementUUID ?? '',
          args.text,
          args.w3cActions
        );
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set value ${args.text} into element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to set value ${args.text} into element ${args.elementUUID}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
