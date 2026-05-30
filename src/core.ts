/**
 * Public extension API for building custom Appium MCP servers.
 *
 * Import from `appium-mcp/core` when composing the default Appium MCP server
 * with organization-specific plugins, tools, prompts, resources, and lifecycle
 * hooks.
 */
export { createAppiumMcpServer } from './create-server.js';
export type { CreateAppiumMcpServerOptions } from './create-server.js';
export { evaluatePolicyTarget } from './policy.js';
export { AppiumDocumentation } from './tools/documentation/plugin.js';
export type {
  AppiumMcpPolicy,
  PolicyDecision,
  PolicyDecisionReason,
  PolicyTargetKind,
} from './policy.js';
export {
  AppiumMcpCore,
  formatVerificationReport,
  McpRegistry,
  PluginManager,
  verifyAppiumMcpNames,
} from './plugin.js';
export type {
  AppiumMcpPlugin,
  PluginContext,
  PluginSessionContext,
  ToolCallContext,
  ToolCallResult,
  VerificationDuplicate,
  VerificationDuplicateKind,
  VerificationEntry,
  VerificationReport,
  VerifyAppiumMcpNamesOptions,
} from './plugin.js';
