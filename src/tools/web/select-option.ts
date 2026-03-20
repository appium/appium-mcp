/**
 * Tool to select an option from a <select> dropdown in Playwright sessions
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';

export default function selectOption(server: FastMCP): void {
  const selectOptionSchema = z.object({
    elementUUID: elementUUIDScheme.describe(
      'The UUID of the <select> element returned by appium_find_element'
    ),
    value: z
      .string()
      .optional()
      .describe('Select option by its value attribute'),
    label: z
      .string()
      .optional()
      .describe('Select option by its visible text label'),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Select option by its zero-based index'),
  });

  server.addTool({
    name: 'playwright_select_option',
    description:
      'Select an option from a <select> dropdown element. Provide value, label, or index. Only works with Playwright web sessions.',
    parameters: selectOptionSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof selectOptionSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const el = driver.requireElement(args.elementUUID);

        let option: Record<string, string | number> = {};
        if (args.value !== undefined) {
          option = { value: args.value };
        } else if (args.label !== undefined) {
          option = { label: args.label };
        } else if (args.index !== undefined) {
          option = { index: args.index };
        } else {
          throw new Error(
            'At least one of value, label, or index must be provided'
          );
        }

        const selected = await el.selectOption(option);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully selected option. Selected values: ${JSON.stringify(selected)}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to select option. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
