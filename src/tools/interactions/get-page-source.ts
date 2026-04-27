import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  createUIResource,
  createPageSourceInspectorUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { getPageSource as _getPageSource } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export default function getPageSource(server: FastMCP): void {
  const pageSourceSchema = z.object({
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });
  server.addTool({
    name: 'appium_get_page_source',
    description: 'Get the page source (XML) from the current screen',
    parameters: pageSourceSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof pageSourceSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const pageSource = await _getPageSource(driver);
        if (!pageSource) {
          throw new Error('Page source is empty or null');
        }

        const textResponse = textResult(
          'Page source retrieved successfully: \n' +
            '```xml ' +
            pageSource +
            '```'
        );

        // Add interactive page source inspector UI
        const uiResource = createUIResource(
          `ui://appium-mcp/page-source-inspector/${Date.now()}`,
          createPageSourceInspectorUI(pageSource)
        );

        return addUIResourceToResponse(textResponse, uiResource);
      } catch (err: unknown) {
        return errorResult(
          `Failed to get page source. Error: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
