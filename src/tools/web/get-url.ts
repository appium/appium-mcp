/**
 * Tool to get the current page URL in Playwright sessions
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';

export default function getUrl(server: FastMCP): void {
  server.addTool({
    name: 'playwright_get_url',
    description:
      'Get the current page URL and title. Only works with Playwright web sessions.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const url = driver.page.url();
        const title = await driver.page.title();
        return {
          content: [
            {
              type: 'text',
              text: `URL: ${url}\nTitle: ${title}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get URL. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
