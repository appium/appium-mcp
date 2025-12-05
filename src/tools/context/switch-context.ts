import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';

export default function switchContext(server: FastMCP): void {
  const schema = z.object({
    context: z
      .string()
      .describe(
        'The name of the context to switch to. Common values: "NATIVE_APP" for native context, or "WEBVIEW_<id>" / "WEBVIEW_<package>" for webview contexts.'
      ),
  });

  server.addTool({
    name: 'appium_switch_context',
    description:
      'Switch to a specific context in the Appium session. Use this to switch between native app context (NATIVE_APP) and webview contexts (WEBVIEW_<id> or WEBVIEW_<package>). Use appium_get_contexts to see available contexts first.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found. Please create a session first.');
      }

      try {
        const [currentContext, availableContexts] = await Promise.all([
          driver.getCurrentContext().catch(() => null),
          driver.getContexts().catch(() => []),
        ]);

        if (currentContext === args.context) {
          return {
            content: [
              {
                type: 'text',
                text: `Already on context "${args.context}".`,
              },
            ],
          };
        }

        if (!availableContexts || availableContexts.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No contexts available. Cannot switch context.',
              },
            ],
            isError: true,
          };
        }

        if (!availableContexts.includes(args.context)) {
          return {
            content: [
              {
                type: 'text',
                text: `Context "${args.context}" not found. Available contexts: ${JSON.stringify(availableContexts, null, 2)}`,
              },
            ],
            isError: true,
          };
        }
        await driver.switchContext(args.context);

        // Verify the switch was successful
        const newContext = await driver.getCurrentContext();

        return {
          content: [
            {
              type: 'text',
              text: `Successfully switched context from "${currentContext || 'N/A'}" to "${newContext}".`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to switch context. Error: ${err.toString()}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
