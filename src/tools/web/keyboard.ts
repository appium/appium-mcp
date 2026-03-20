/**
 * Tools for keyboard interactions in Playwright sessions
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';

export function type(server: FastMCP): void {
  const typeSchema = z.object({
    elementUUID: elementUUIDScheme.optional().describe(
      'Optional UUID of the element to type into. If not provided, types into the currently focused element.'
    ),
    text: z.string().describe('The text to type character by character'),
    delay: z
      .number()
      .min(0)
      .max(1000)
      .optional()
      .describe(
        'Delay between keystrokes in milliseconds. Default is 0 (instant).'
      ),
  });

  server.addTool({
    name: 'playwright_type',
    description:
      'Type text character by character (simulating real keyboard input). Unlike set_value/fill which replaces the entire value, this types each character individually. Useful for contenteditable elements, search-as-you-type, and autocomplete fields. Only works with Playwright web sessions.',
    parameters: typeSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof typeSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        if (args.elementUUID) {
          const el = driver.requireElement(args.elementUUID);
          await el.type(args.text, { delay: args.delay });
        } else {
          await driver.page.keyboard.type(args.text, { delay: args.delay });
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully typed "${args.text}"${args.elementUUID ? ` into element ${args.elementUUID}` : ''}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to type text. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}

export function pressKey(server: FastMCP): void {
  const pressKeySchema = z.object({
    key: z
      .string()
      .describe(
        'Key to press. Examples: "Enter", "Tab", "Escape", "ArrowDown", "Control+a", "Meta+c", "Shift+Tab"'
      ),
  });

  server.addTool({
    name: 'playwright_press_key',
    description:
      'Press a keyboard key or key combination. Supports modifiers (Control, Shift, Alt, Meta). Only works with Playwright web sessions.',
    parameters: pressKeySchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof pressKeySchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        await driver.page.keyboard.press(args.key);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully pressed key "${args.key}"`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to press key "${args.key}". Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
