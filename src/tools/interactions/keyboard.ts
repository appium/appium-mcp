import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

export default function keyboard(server: FastMCP): void {
  const hideKeyboardSchema = z.object({
    keys: z
      .array(z.string())
      .optional()
      .describe(
        'Optional key names used to dismiss the keyboard (e.g. "done" on tablets). ' +
          'Maps to the `keys` argument of mobile: hideKeyboard. Omit for default behavior.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_hide_keyboard',
    description:
      'Dismiss the on-screen software keyboard via Appium `mobile: hideKeyboard`. ' +
      'Supports Android (UiAutomator2) and iOS (XCUITest). ' +
      'May fail when no dismiss control exists; use gestures or back as a fallback.',
    parameters: hideKeyboardSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof hideKeyboardSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const params =
          args.keys && args.keys.length > 0 ? { keys: args.keys } : {};
        await execute(driver, 'mobile: hideKeyboard', params);
        return {
          content: [
            {
              type: 'text',
              text: 'Keyboard dismissed successfully.',
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to hide keyboard. Error: ${message}`,
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: 'appium_mobile_is_keyboard_shown',
    description:
      'Return whether the system on-screen keyboard is visible using Appium `mobile: isKeyboardShown`. ' +
      'Supports Android (UiAutomator2) and iOS (XCUITest). Response is JSON: `{ "keyboardShown": true|false }`.',
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
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const raw = await execute(driver, 'mobile: isKeyboardShown', {});
        if (typeof raw !== 'boolean') {
          throw new Error(
            `Unexpected isKeyboardShown result type: ${typeof raw}`
          );
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ keyboardShown: raw }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to query keyboard visibility. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
