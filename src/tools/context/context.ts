import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { setCurrentContext } from '../../session-store.js';
import { getContexts, getCurrentContext, setContext } from '../../command.js';
import {
  createUIResource,
  createContextSwitcherUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const contextSchema = z.object({
  action: z.enum(['list', 'switch']).describe('list or switch.'),
  context: z
    .string()
    .optional()
    .describe('switch target, e.g. NATIVE_APP or WEBVIEW_<id>.'),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

export default function context(server: FastMCP): void {
  server.addTool({
    name: 'appium_context',
    description: 'List or switch Appium contexts.',
    parameters: contextSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof contextSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const [currentContext, availableContexts] = await Promise.all([
          getCurrentContext(driver).catch(() => null),
          getContexts(driver).catch(() => [] as string[]),
        ]);

        if (currentContext) {
          setCurrentContext(currentContext, args.sessionId);
        }

        if (args.action === 'list') {
          if (!availableContexts || availableContexts.length === 0) {
            return textResult('No contexts available.');
          }

          const textResponse = textResult(
            `Available contexts: ${JSON.stringify(availableContexts, null, 2)}\nCurrent context: ${currentContext}`
          );

          return addUIResourceToResponse(textResponse, () =>
            createUIResource(
              `ui://appium-mcp/context-switcher/${Date.now()}`,
              createContextSwitcherUI(availableContexts, currentContext)
            )
          );
        }

        if (!args.context) {
          return errorResult('context is required when action is switch');
        }

        if (currentContext === args.context) {
          return textResult(`Already on context "${args.context}".`);
        }

        if (!availableContexts || availableContexts.length === 0) {
          return errorResult('No contexts available. Cannot switch context.');
        }

        if (!availableContexts.includes(args.context)) {
          return errorResult(
            `Context "${args.context}" not found. Available contexts: ${JSON.stringify(availableContexts, null, 2)}`
          );
        }

        await setContext(driver, args.context);
        const newContext = await getCurrentContext(driver);
        setCurrentContext(newContext, args.sessionId);

        return textResult(
          `Successfully switched context from "${currentContext}" to "${newContext}".`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed context action ${args.action}. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
