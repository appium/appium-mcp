import type {FastMCP} from 'fastmcp';

import {createControlCenterAppUI} from '../ui/control-center-app.js';
import {MCP_APP_MIME_TYPE} from '../ui/mcp-apps.js';

export const CONTROL_CENTER_URI = 'ui://appium-mcp/control-center';

export default function controlCenterResource(server: FastMCP): void {
  server.addResource({
    uri: CONTROL_CENTER_URI,
    name: 'Appium Control Center',
    description: 'Interactive views for Appium sessions, devices, contexts, and installed apps',
    mimeType: MCP_APP_MIME_TYPE,
    async load() {
      return {text: createControlCenterAppUI()};
    },
  });
}
