/**
 * Public extension API for building custom Appium MCP servers.
 *
 * Import from `appium-mcp/core` when composing the default Appium MCP server
 * with organization-specific plugins, tools, prompts, resources, and lifecycle
 * hooks.
 */
export { createAppiumMcpServer } from './create-server.js';
export type { CreateAppiumMcpServerOptions } from './create-server.js';
export { AppiumMcpCore, McpRegistry, PluginManager } from './plugin.js';
export type {
  AppiumMcpPlugin,
  PluginContext,
  PluginSessionContext,
  ToolCallContext,
  ToolCallResult,
} from './plugin.js';
