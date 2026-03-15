/**
 * Tool to evaluate JavaScript in a Playwright web session
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isPlaywrightDriverSession } from '../../session-store.js';

export default function evaluate(server: FastMCP): void {
  const evaluateSchema = z.object({
    script: z
      .string()
      .describe(
        'JavaScript code to evaluate in the browser page context. The result will be serialized and returned.'
      ),
  });

  server.addTool({
    name: 'playwright_evaluate',
    description:
      'Execute JavaScript code in the browser page context and return the result. Only works with Playwright web sessions.',
    parameters: evaluateSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof evaluateSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver || !isPlaywrightDriverSession(driver)) {
        throw new Error(
          'No Playwright web session found. Create a session with platform="web" first.'
        );
      }

      try {
        const result = await driver.page.evaluate(args.script);
        const resultStr =
          typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: 'text',
              text: `Script executed successfully.\nResult: ${resultStr ?? 'undefined'}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to evaluate script. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
