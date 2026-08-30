import type {FastMCP} from 'fastmcp';

import {MCP_APP_MIME_TYPE} from '../ui/mcp-apps.js';
import {createScreenshotViewerAppUI} from '../ui/screenshot-viewer-app.js';

export const SCREENSHOT_VIEWER_URI = 'ui://appium-mcp/screenshot-viewer';

export default function screenshotViewerResource(server: FastMCP): void {
  server.addResource({
    uri: SCREENSHOT_VIEWER_URI,
    name: 'Appium Screenshot Viewer',
    description: 'Interactive viewer for appium_screenshot results',
    mimeType: MCP_APP_MIME_TYPE,
    async load() {
      return {text: createScreenshotViewerAppUI()};
    },
  });
}
