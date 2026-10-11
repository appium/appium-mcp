import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {getPageSource as _getPageSource} from '../../command.js';
import {PAGE_SOURCE_INSPECTOR_URI} from '../../resources/page-source-inspector.js';
import {clientSupportsMcpApps, isMcpAppsEnabled} from '../../ui/mcp-apps.js';
import {createUIResource, createPageSourceInspectorUI, addUIResourceToResponse} from '../../ui/mcp-ui-utils.js';
import {resolveDriver, textResult, errorResult, toolErrorMessage} from '../tool-response.js';
import {summarizePageSource} from './page-source-summary.js';

export default function getPageSource(server: FastMCP): void {
  const mcpAppsEnabled = isMcpAppsEnabled();
  const pageSourceSchema = z.object({
    inline: z.boolean().default(false).describe('Return XML without saving.'),
    selector: z.string().optional().describe('XPath selecting elements.'),
    pattern: z.string().min(1).optional().describe('Literal tag/attribute substring.'),
    sessionId: z.string().optional().describe('Session ID; defaults to the active session.'),
  });
  server.addTool({
    name: 'appium_get_page_source',
    description:
      'Save XML on MCP server; return path/bytes and optional node summaries. Full XML requires inline=true.',
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

        if (!args.inline) {
          const summary =
            args.selector !== undefined || args.pattern !== undefined
              ? summarizePageSource(pageSource, args.selector, args.pattern)
              : {};
          const directory = process.env.PAGE_SOURCES_DIR ? resolve(process.env.PAGE_SOURCES_DIR) : tmpdir();
          await mkdir(directory, {recursive: true});
          const filepath = join(directory, `page-source-${randomUUID()}.xml`);
          await writeFile(filepath, pageSource, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
          return textResult(JSON.stringify({filepath, bytes: Buffer.byteLength(pageSource, 'utf8'), ...summary}));
        }
        if (args.selector !== undefined || args.pattern !== undefined) {
          return errorResult('Use inline=false when selecting or filtering page source nodes.');
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
