import { FastMCP } from 'fastmcp/dist/FastMCP.js';
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
  ]),
  selector: z.string().describe('The selector to find the element'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description:
      'Find an element with the given strategy and selector which will return a uuid that can be used while interaction',
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const element = await (driver as any).findElement(
          args.strategy,
          args.selector
        );
        return {
          content: [
            {
              type: 'text',
              text: `Successfully found element ${args.selector} with strategy ${args.strategy}. Element id ${element.ELEMENT}`,
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
