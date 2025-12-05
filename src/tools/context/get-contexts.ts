import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';

export default function getContexts(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_contexts',
    description:
      'Get all available contexts in the current Appium session. Returns a list of context names including NATIVE_APP and any webview contexts (e.g., WEBVIEW_<id> or WEBVIEW_<package>).',
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
        const [currentContext, contexts] = await Promise.all([
          driver.getCurrentContext().catch(() => null),
          driver.getContexts().catch(() => []),
        ]);

        if (!contexts || contexts.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No contexts available.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Available contexts: ${JSON.stringify(contexts, null, 2)}\nCurrent context: ${currentContext || 'N/A'}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get contexts. Error: ${err.toString()}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
