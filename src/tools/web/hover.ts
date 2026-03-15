/**
 * Tool to hover over an element in Playwright sessions
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';

export default function hover(server: FastMCP): void {
  const hoverSchema = z.object({
    elementUUID: elementUUIDScheme,
  });

  server.addTool({
    name: 'playwright_hover',
    description:
      'Hover over an element to trigger hover states, tooltips, or dropdown menus. Only works with Playwright web sessions.',
    parameters: hoverSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof hoverSchema>,
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
        await el.hover();

        return {
          content: [
            {
              type: 'text',
              text: `Successfully hovered over element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to hover over element ${args.elementUUID}. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
