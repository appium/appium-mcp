import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {getContexts, getCurrentContext, setContext} from '../../command.js';
import {CONTROL_CENTER_URI} from '../../resources/control-center.js';
import {setCurrentContext} from '../../session-store.js';
import {clientSupportsMcpApps, isMcpAppsEnabled} from '../../ui/mcp-apps.js';
import {createUIResource, createContextSwitcherUI, addUIResourceToResponse} from '../../ui/mcp-ui-utils.js';
import {resolveDriver, textResult, errorResult, toolErrorMessage} from '../tool-response.js';

const contextSchema = z.object({
  action: z.enum(['list', 'switch']).describe('Use list to fetch contexts or switch to change context.'),
  context: z
    .string()
    .optional()
    .describe('Required when action is switch. Common values: NATIVE_APP or WEBVIEW_<id>/WEBVIEW_<package>.'),
  sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
});

export default function context(server: FastMCP): void {
  const mcpAppsEnabled = isMcpAppsEnabled();
  server.addTool({
    name: 'appium_context',
    description: 'List available/current Appium contexts or switch to a target.',
    _meta: mcpAppsEnabled ? {ui: {resourceUri: CONTROL_CENTER_URI}} : undefined,
    parameters: contextSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof contextSchema>,
      context: Record<string, unknown> | undefined,
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const {driver} = resolved;
      const useMcpApps = mcpAppsEnabled && clientSupportsMcpApps(server, context);

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
            `Available contexts: ${JSON.stringify(availableContexts, null, 2)}\nCurrent context: ${currentContext}`,
          );

          if (useMcpApps) {
            return {
              ...textResponse,
              structuredContent: {
                appiumMcpView: {
                  type: 'context-switcher',
                  contexts: availableContexts,
                  currentContext,
                  sessionId: args.sessionId,
                },
              },
            };
          }

          return addUIResourceToResponse(textResponse, () =>
            createUIResource(
              `ui://appium-mcp/context-switcher/${Date.now()}`,
              createContextSwitcherUI(availableContexts, currentContext),
            ),
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
            `Context "${args.context}" not found. Available contexts: ${JSON.stringify(availableContexts, null, 2)}`,
          );
        }

        await setContext(driver, args.context);
        const newContext = await getCurrentContext(driver);
        setCurrentContext(newContext, args.sessionId);

        return textResult(`Successfully switched context from "${currentContext}" to "${newContext}".`);
      } catch (err: unknown) {
        return errorResult(`Failed context action ${args.action}. err: ${toolErrorMessage(err)}`);
      }
    },
  });
}
