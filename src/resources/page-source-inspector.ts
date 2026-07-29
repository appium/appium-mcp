import type {FastMCP} from 'fastmcp';

import {MCP_APP_MIME_TYPE} from '../ui/mcp-apps.js';
import {createPageSourceInspectorAppUI} from '../ui/page-source-inspector-app.js';

export const PAGE_SOURCE_INSPECTOR_URI = 'ui://appium-mcp/page-source-inspector';

export default function pageSourceInspectorResource(server: FastMCP): void {
  server.addResource({
    uri: PAGE_SOURCE_INSPECTOR_URI,
    name: 'Appium Page Source Inspector',
    description: 'Interactive inspector for appium_get_page_source results',
    mimeType: MCP_APP_MIME_TYPE,
    async load() {
      return {text: createPageSourceInspectorAppUI()};
    },
  });
}
