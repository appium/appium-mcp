import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';

export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath',
    'id',
    'name',
    'class name',
    'accessibility id',
    'css selector',
    '-android uiautomator',
    '-ios predicate string',
    '-ios class chain',
    'tag name',
    'text',
    'data-testid',
    'test id',
    'placeholder',
    'role',
  ]),
  selector: z.string().describe('The selector to find the element'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description:
      'Find a specific element by strategy and selector which will return a uuid that can be used for interactions. [PRIORITY 2: Use this to search for a target element by xpath, id, accessibility id, css selector, text, data-testid, etc.] Works with both Appium mobile sessions and Playwright web sessions.',
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof findElementSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const element = await driver.findElement(args.strategy, args.selector);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully found element ${args.selector} with strategy ${args.strategy}. Element id ${element['element-6066-11e4-a52e-4f735466cecf']}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to find element ${args.selector} with strategy ${args.strategy}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
