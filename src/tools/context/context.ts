import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, setCurrentContext } from '../../session-store.js';
import { getContexts, getCurrentContext, setContext } from '../../command.js';
import {
  createUIResource,
  createContextSwitcherUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';

const contextSchema = z.object({
  action: z
    .enum(['list', 'switch'])
    .describe('Use list to fetch contexts or switch to change context.'),
  context: z
    .string()
    .optional()
    .describe(
      'Required when action is switch. Common values: NATIVE_APP or WEBVIEW_<id>/WEBVIEW_<package>.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function context(server: FastMCP): void {
  server.addTool({
    name: 'appium_context',
    description:
      'Manage Appium contexts with one tool. action=list returns all contexts and current context. action=switch changes to a target context.',
    parameters: contextSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof contextSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        const driver = getDriver(args.sessionId);
        if (!driver) {
          throw new Error('No driver found. Please create a session first.');
        }

        const [currentContext, availableContexts] = await Promise.all([
          getCurrentContext(driver).catch(() => null),
          getContexts(driver).catch(() => [] as string[]),
        ]);

        if (currentContext) {
          setCurrentContext(currentContext);
        }

        if (args.action === 'list') {
          if (!availableContexts || availableContexts.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No contexts available.',
                },
              ],
            };
          }

          const textResponse = {
            content: [
              {
                type: 'text',
                text: `Available contexts: ${JSON.stringify(availableContexts, null, 2)}\nCurrent context: ${currentContext}`,
              },
            ],
          };

          const uiResource = createUIResource(
            `ui://appium-mcp/context-switcher/${Date.now()}`,
            createContextSwitcherUI(availableContexts, currentContext)
          );

          return addUIResourceToResponse(textResponse, uiResource);
        }

        if (!args.context) {
          throw new Error('context is required when action is switch');
        }

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

        await setContext(driver, args.context);
        const newContext = await getCurrentContext(driver);
        setCurrentContext(newContext);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully switched context from "${currentContext}" to "${newContext}".`,
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed context action ${args.action}. err: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
