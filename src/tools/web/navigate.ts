/**
 * Tool to navigate to a URL in a Playwright web session
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';

export default function navigate(server: FastMCP): void {
  const navigateSchema = z.object({
    url: z.string().describe('The URL to navigate to'),
    waitUntil: z
      .enum(['load', 'domcontentloaded', 'networkidle', 'commit'])
      .optional()
      .describe(
        "When to consider navigation complete. Default is 'load'. Use 'networkidle' to wait until no network requests for 500ms."
      ),
  });

  server.addTool({
    name: 'playwright_navigate',
    description:
      'Navigate to a URL in the browser. Only works with Playwright web sessions.',
    parameters: navigateSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
    },
    execute: async (
      args: z.infer<typeof navigateSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const response = await driver.page.goto(args.url, {
          waitUntil: args.waitUntil || 'load',
        });

        const status = response?.status() ?? 'unknown';
        const title = await driver.page.title();

        return {
          content: [
            {
              type: 'text',
              text: `Navigated to ${args.url}\nStatus: ${status}\nTitle: ${title}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to navigate to ${args.url}. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
