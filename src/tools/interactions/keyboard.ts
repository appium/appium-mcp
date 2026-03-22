import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

/** Normalize `isKeyboardShown` execute result (boolean or wrapped `value`). */
function normalizeKeyboardShownResult(result: unknown): boolean {
  if (typeof result === 'boolean') {
    return result;
  }
  if (result && typeof result === 'object' && 'value' in result) {
    const v = (result as { value: unknown }).value;
    if (typeof v === 'boolean') {
      return v;
    }
    if (typeof v === 'string') {
      return v.toLowerCase() === 'true';
    }
  }
  return Boolean(result);
}

export default function keyboard(server: FastMCP): void {
  const hideKeyboardSchema = z.object({
    keys: z
      .array(z.string())
      .optional()
      .describe(
        'Optional key names used to dismiss the keyboard (e.g. "done" on tablets). ' +
          'Maps to the `keys` argument of mobile: hideKeyboard. Omit for default behavior.'
      ),
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
      const driver = getDriver();
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
        const raw = await execute(driver, 'mobile: isKeyboardShown', {});
        const shown = normalizeKeyboardShownResult(raw);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ keyboardShown: shown }, null, 2),
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
