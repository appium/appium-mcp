import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';

export default function getPageSource(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_page_source',
    description: 'Get the page source (XML) from the current screen',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found. Please create a session first.');
      }

      try {
        const pageSource = await driver.getPageSource();

        if (!pageSource) {
          throw new Error('Page source is empty or null');
        }

        return {
          content: [
            {
              type: 'text',
              text:
                'Page source retrieved successfully: \n' +
                '```xml ' +
                pageSource +
                '```',
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get page source. Error: ${err.toString()}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
