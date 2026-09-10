import type {FastMCP} from 'fastmcp';

import type {AppiumMcpPlugin} from './core.js';
import {createAppiumMcpServer} from './create-server.js';
import {isDocumentationEnabled, loadDocumentationPlugin} from './documentation.js';

export default async function createDefaultServer(
  additionalPlugins: readonly AppiumMcpPlugin[] = [],
): Promise<FastMCP> {
  const plugins = [...additionalPlugins];

  // Documentation tools (RAG docs query + skills) are opt-in. They live in a
  // separate package only installed when the user sets
  // APPIUM_MCP_DOCS_ENABLED. See ./documentation.ts for the full contract.
  if (isDocumentationEnabled()) {
    const documentationPlugin = await loadDocumentationPlugin();
    if (documentationPlugin) {
      plugins.unshift(documentationPlugin);
    }
  }

  return createAppiumMcpServer({plugins});
}
