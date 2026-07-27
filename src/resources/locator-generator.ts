import type {FastMCP} from 'fastmcp';

import {createLocatorGeneratorAppUI} from '../ui/locator-generator-app.js';
import {MCP_APP_MIME_TYPE} from '../ui/mcp-apps.js';

export const LOCATOR_GENERATOR_URI = 'ui://appium-mcp/locator-generator';

export default function locatorGeneratorResource(server: FastMCP): void {
  server.addResource({
    uri: LOCATOR_GENERATOR_URI,
    name: 'Appium Locator Generator',
    description: 'Interactive viewer for generate_locators results',
    mimeType: MCP_APP_MIME_TYPE,
    async load() {
      return {text: createLocatorGeneratorAppUI()};
    },
  });
}
