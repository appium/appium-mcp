import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, isRemoteDriverSession } from '../../session-store.js';
import {
  createUIResource,
  createContextSwitcherUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';

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

      if (isRemoteDriverSession(driver)) {
        throw new Error(
          'Get context is not yet implemented for the remote driver'
        );
      }

      try {
        const [currentContext, contexts] = await Promise.all([
          (driver as any).getCurrentContext().catch(() => null),
          (driver as any).getContexts().catch(() => []),
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

        const textResponse = {
          content: [
            {
              type: 'text',
              text: `Available contexts: ${JSON.stringify(contexts, null, 2)}\nCurrent context: ${currentContext || 'N/A'}`,
            },
          ],
        };

        // Add interactive context switcher UI
        const uiResource = createUIResource(
          `ui://appium-mcp/context-switcher/${Date.now()}`,
          createContextSwitcherUI(contexts, currentContext)
        );

        return addUIResourceToResponse(textResponse, uiResource);
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
