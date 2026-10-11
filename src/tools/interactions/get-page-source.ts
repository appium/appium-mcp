import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {getPageSource as _getPageSource} from '../../command.js';
import {PAGE_SOURCE_INSPECTOR_URI} from '../../resources/page-source-inspector.js';
import {clientSupportsMcpApps, isMcpAppsEnabled} from '../../ui/mcp-apps.js';
import {createUIResource, createPageSourceInspectorUI, addUIResourceToResponse} from '../../ui/mcp-ui-utils.js';
import {resolveDriver, textResult, errorResult, toolErrorMessage} from '../tool-response.js';
import {cachePageSource} from './page-source-cache.js';

export default function getPageSource(server: FastMCP): void {
  const mcpAppsEnabled = isMcpAppsEnabled();
  const pageSourceSchema = z.object({
    cache: z.boolean().default(false).describe('Save fresh XML to a file; return path/bytes instead of XML.'),
    selector: z.string().optional().describe('XPath selecting elements.'),
    pattern: z.string().min(1).optional().describe('Literal tag/attribute substring.'),
    sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
  });
  server.addTool({
    name: 'appium_get_page_source',
    description:
      'Get the page source (XML) from the current screen by default. Set cache=true for server-local saving and optional node summaries.',
    _meta: mcpAppsEnabled ? {ui: {resourceUri: PAGE_SOURCE_INSPECTOR_URI}} : undefined,
    parameters: pageSourceSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof pageSourceSchema>,
      context: Record<string, unknown> | undefined,
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const {driver} = resolved;

      try {
        const pageSource = await _getPageSource(driver);
        if (!pageSource) {
          return errorResult('Page source is empty or null');
        }

        if (args.cache === true) {
          return textResult(JSON.stringify(await cachePageSource(pageSource, args)));
        }
        if (args.selector !== undefined || args.pattern !== undefined) {
          return errorResult('Use cache=true when selecting or filtering page source nodes.');
        }

        const textResponse = textResult('Page source retrieved successfully: \n' + '```xml ' + pageSource + '```');

        // MCP Apps-capable clients fetch the static inspector once and pass
        // this existing text result to it, avoiding a second copy of the XML.
        if (mcpAppsEnabled && clientSupportsMcpApps(server, context)) {
          return textResponse;
        }

        // Add interactive page source inspector UI
        return addUIResourceToResponse(textResponse, () =>
          createUIResource(`${PAGE_SOURCE_INSPECTOR_URI}/${Date.now()}`, createPageSourceInspectorUI(pageSource)),
        );
      } catch (err: unknown) {
        return errorResult(`Failed to get page source. Error: ${toolErrorMessage(err)}`);
      }
    },
  });
}
