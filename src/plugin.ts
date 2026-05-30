/**
 * Plugin system for Appium MCP.
 *
 * This module defines the `AppiumMcpPlugin` interface and related types, as well
 * as the `PluginManager` class which handles plugin registration, lifecycle, and
 * tool call interception.
 */

import type {
  ContentResult,
  FastMCP,
  FastMCPSessionAuth,
  Tool,
  ToolParameters,
} from 'fastmcp';
import {
  getDriver,
  getSessionId,
  getSessionInfo,
  listSessions,
} from './session-store.js';
import type { DriverInstance, SessionInfo } from './session-store.js';
import log from './logger.js';
import registerTools from './tools/index.js';

const CORE_SOURCE = 'appium-mcp core';

/**
 * Context passed to plugin lifecycle methods.
 *
 * This is intentionally smaller than the underlying FastMCP server. Plugins
 * should use `McpRegistry` during `register()` for MCP capabilities and
 * `AppiumMcpCore` for Appium MCP state.
 */
export interface PluginContext {
  readonly core: AppiumMcpCore;
  readonly plugins: ReadonlyMap<string, AppiumMcpPlugin>;
}

/**
 * Session helpers available to call hooks.
 */
export interface PluginSessionContext {
  getSessionInfo(sessionId?: string): SessionInfo | null;
  getSessionId(): string | null;
  getDriver(sessionId?: string): DriverInstance | null;
  listSessions(): ReturnType<typeof listSessions>;
}

/**
 * Context passed to `beforeCall` and `afterCall` for each MCP tool execution.
 */
export interface ToolCallContext {
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly session: PluginSessionContext;
}

/**
 * Tool result shape plugins may return to short-circuit or modify a tool call.
 */
export interface ToolCallResult {
  isError: boolean;
  content: ContentResult['content'];
}

/**
 * Extension point for composing app-specific behavior into Appium MCP.
 */
export interface AppiumMcpPlugin {
  /**
   * Unique plugin identifier within a server instance.
   *
   * Duplicate plugin names are skipped with a warning, so prefer stable
   * package-style or organization-prefixed names. This differs from MCP tool
   * names: FastMCP replaces an existing tool when another tool is registered
   * with the same name.
   */
  readonly name: string;
  readonly version: string;
  initialize?(ctx: PluginContext): Promise<void>;
  register?(registry: McpRegistry, core: AppiumMcpCore): void;
  /**
   * Tool-only hook. Prompts, resources, and resource templates are registered
   * through FastMCP but are not wrapped by plugin call hooks.
   */
  beforeCall?(ctx: ToolCallContext): Promise<ToolCallResult | void>;
  /**
   * Tool-only hook. Prompts, resources, and resource templates are registered
   * through FastMCP but are not wrapped by plugin call hooks.
   */
  afterCall?(
    ctx: ToolCallContext,
    result: ToolCallResult
  ): Promise<ToolCallResult | void>;
  destroy?(): Promise<void>;
}

export type VerificationDuplicateKind = 'plugin' | 'tool';

export interface VerificationEntry {
  name: string;
  source: string;
}

export interface VerificationDuplicate {
  kind: VerificationDuplicateKind;
  name: string;
  entries: VerificationEntry[];
}

export interface VerificationError {
  source: string;
  message: string;
}

export interface VerificationReport {
  ok: boolean;
  pluginCount: number;
  toolCount: number;
  duplicates: VerificationDuplicate[];
  errors: VerificationError[];
}

export interface VerifyAppiumMcpNamesOptions {
  plugins?: AppiumMcpPlugin[];
  errors?: VerificationError[];
}

type AddToolParam = Parameters<FastMCP['addTool']>[0];

type AddToolsParam = Parameters<FastMCP['addTools']>[0];

type AddPromptParam = Parameters<FastMCP['addPrompt']>[0];

type AddResourceParam = Parameters<FastMCP['addResource']>[0];

type AddResourceTemplateParam = Parameters<FastMCP['addResourceTemplate']>[0];

type VerificationToolDef = {
  name: string;
};

type CapabilityCollector = {
  addTool(toolDef: VerificationToolDef): void;
  addPrompt(promptDef: unknown): void;
  addResource(resourceDef: unknown): void;
  addResourceTemplate(resourceTemplateDef: unknown): void;
};

export class McpRegistry {
  constructor(private readonly server: FastMCP) {}

  /**
   * Register one MCP tool. Tool calls are wrapped by plugin call hooks.
   *
   * Delegates to FastMCP `addTool`. If a tool with the same name was already
   * registered, FastMCP replaces the earlier tool with this definition.
   *
   * @see https://github.com/punkpeye/fastmcp#tools
   */
  addTool<Params extends ToolParameters>(
    name: string,
    description: string,
    parameters: Params,
    execute: Tool<FastMCPSessionAuth, Params>['execute']
  ): void {
    this.server.addTool({ name, description, parameters, execute });
  }

  /**
   * Register multiple MCP tools.
   *
   * Delegates to FastMCP `addTool` for each definition.
   * Duplicate tool names are therefore last-registration-wins.
   *
   * @see https://github.com/punkpeye/fastmcp#tools
   */
  addTools(
    defs: Array<{
      name: string;
      description: string;
      parameters: ToolParameters;
      execute: AddToolParam['execute'];
    }>
  ): void {
    for (const def of defs) {
      this.addTool(def.name, def.description, def.parameters, def.execute);
    }
  }

  /**
   * Register one MCP prompt.
   *
   * Delegates to FastMCP `addPrompt`.
   *
   * @see https://github.com/punkpeye/fastmcp#prompts
   */
  addPrompt(prompt: AddPromptParam): void {
    this.server.addPrompt(prompt);
  }

  /**
   * Register multiple MCP prompts.
   *
   * Delegates to FastMCP `addPrompt` for each definition.
   *
   * @see https://github.com/punkpeye/fastmcp#prompts
   */
  addPrompts(prompts: AddPromptParam[]): void {
    for (const prompt of prompts) {
      this.addPrompt(prompt);
    }
  }

  /**
   * Register one MCP resource.
   *
   * Delegates to FastMCP `addResource`.
   *
   * @see https://github.com/punkpeye/fastmcp#resources
   */
  addResource(resource: AddResourceParam): void {
    this.server.addResource(resource);
  }

  /**
   * Register multiple MCP resources.
   *
   * Delegates to FastMCP `addResource` for each definition.
   *
   * @see https://github.com/punkpeye/fastmcp#resources
   */
  addResources(resources: AddResourceParam[]): void {
    for (const resource of resources) {
      this.addResource(resource);
    }
  }

  /**
   * Register one MCP resource template.
   *
   * Delegates to FastMCP `addResourceTemplate`.
   *
   * @see https://github.com/punkpeye/fastmcp#resource-templates
   */
  addResourceTemplate(resourceTemplate: AddResourceTemplateParam): void {
    this.server.addResourceTemplate(resourceTemplate);
  }

  /**
   * Register multiple MCP resource templates.
   *
   * Delegates to FastMCP `addResourceTemplate` for each definition.
   *
   * @see https://github.com/punkpeye/fastmcp#resource-templates
   */
  addResourceTemplates(resourceTemplates: AddResourceTemplateParam[]): void {
    for (const resourceTemplate of resourceTemplates) {
      this.addResourceTemplate(resourceTemplate);
    }
  }
}

/**
 * Safe Appium MCP primitives exposed to plugins.
 */
export class AppiumMcpCore {
  /**
   * Return the currently active Appium session id, if one exists.
   */
  getSessionId(): string | null {
    return getSessionId();
  }

  /**
   * Return metadata for a specific session, or the active session if `sessionId` is not provided.
   */
  getSessionInfo(sessionId?: string): SessionInfo | null {
    return getSessionInfo(sessionId);
  }

  /**
   * Return the active driver, or a driver for a specific Appium session id.
   */
  getDriver(sessionId?: string): DriverInstance | null {
    return getDriver(sessionId);
  }

  /**
   * Return metadata for all Appium sessions tracked by this server.
   */
  listSessions(): ReturnType<typeof listSessions> {
    return listSessions();
  }
}

export class PluginManager {
  private readonly pluginMap = new Map<string, AppiumMcpPlugin>();
  private readonly server: FastMCP;
  private readonly core: AppiumMcpCore;
  private readonly capabilityPluginNames = new Set<string>();
  private addToolInterceptorInstalled = false;

  constructor(server: FastMCP) {
    this.server = server;
    this.core = new AppiumMcpCore();
  }

  register(plugins: AppiumMcpPlugin[]): void {
    for (const plugin of plugins) {
      if (this.pluginMap.has(plugin.name)) {
        log.warn(
          `[PluginManager] Duplicate plugin name "${plugin.name}" – skipping.`
        );
        continue;
      }
      this.pluginMap.set(plugin.name, plugin);
      log.info(
        `[PluginManager] Registered plugin "${plugin.name}" v${plugin.version}`
      );
    }
    this.installAddToolInterceptor();
  }

  registerPluginCapabilities(): void {
    const registry = new McpRegistry(this.server);
    for (const plugin of this.pluginMap.values()) {
      if (this.capabilityPluginNames.has(plugin.name)) {
        log.warn(
          `[PluginManager] Duplicate plugin name "${plugin.name}" – skipping.`
        );
        continue;
      }
      this.capabilityPluginNames.add(plugin.name);

      if (typeof plugin.register === 'function') {
        plugin.register(registry, this.core);
      }
    }
  }

  async initialize(): Promise<void> {
    const ctx: PluginContext = {
      core: this.core,
      plugins: this.pluginMap as ReadonlyMap<string, AppiumMcpPlugin>,
    };
    for (const plugin of this.pluginMap.values()) {
      if (typeof plugin.initialize === 'function') {
        await plugin.initialize(ctx);
      }
    }
  }

  async destroy(): Promise<void> {
    for (const plugin of Array.from(this.pluginMap.values()).reverse()) {
      if (typeof plugin.destroy === 'function') {
        await plugin.destroy();
      }
    }
  }

  private installAddToolInterceptor(): void {
    if (this.addToolInterceptorInstalled) {
      return;
    }
    this.addToolInterceptorInstalled = true;

    const originalAddTool = this.server.addTool.bind(
      this.server
    ) as FastMCP['addTool'];

    this.server.addTool = (<Params extends ToolParameters>(
      toolDef: Tool<FastMCPSessionAuth, Params>
    ): void => {
      const wrappedExecute: Tool<
        FastMCPSessionAuth,
        Params
      >['execute'] = async (args, mcpCtx) => {
        const sessionCtx: PluginSessionContext = {
          getSessionId: () => getSessionId(),
          getSessionInfo: (sessionId?: string) => getSessionInfo(sessionId),
          getDriver: (sessionId?: string) => getDriver(sessionId),
          listSessions,
        };

        const toolCtx: ToolCallContext = {
          toolName: toolDef.name,
          args: (args || {}) as Record<string, unknown>,
          session: sessionCtx,
        };

        for (const plugin of this.pluginMap.values()) {
          if (typeof plugin.beforeCall !== 'function') {
            continue;
          }
          const override = await plugin.beforeCall(toolCtx);
          if (override != null) {
            return {
              content: override.content,
              isError: override.isError,
            } as ContentResult;
          }
        }

        const rawResult = (await toolDef.execute(
          args,
          mcpCtx
        )) as ContentResult;
        let hookResult: ToolCallResult = {
          isError: rawResult.isError ?? false,
          content: rawResult.content as ToolCallResult['content'],
        };

        for (const plugin of this.pluginMap.values()) {
          if (typeof plugin.afterCall !== 'function') {
            continue;
          }
          const modified = await plugin.afterCall(toolCtx, hookResult);
          if (modified != null) {
            hookResult = modified;
          }
        }

        return {
          content: hookResult.content,
          isError: hookResult.isError,
        } as ContentResult;
      };

      return originalAddTool({ ...toolDef, execute: wrappedExecute });
    }) as FastMCP['addTool'];

    // Keep batch tool registration on the same hook-wrapped path as addTool.
    this.server.addTools = ((toolDefs: AddToolsParam): void => {
      for (const toolDef of toolDefs) {
        this.server.addTool(toolDef);
      }
    }) as FastMCP['addTools'];
  }
}

/**
 * Verify that plugin and tool names are unique across a set of plugins
 * and report any duplicates or registration errors.
 * @param options - Options for verification, including the list of plugins and any pre-existing errors.
 * @returns A report detailing any duplicates or errors found during verification.
 */
export function verifyAppiumMcpNames(
  options: VerifyAppiumMcpNamesOptions = {}
): VerificationReport {
  const plugins = options.plugins ?? [];
  const errors = [...(options.errors ?? [])];
  const duplicates: VerificationDuplicate[] = [];
  const toolEntries: VerificationEntry[] = [];
  let currentSource = CORE_SOURCE;

  const collector: CapabilityCollector = {
    addTool(toolDef: VerificationToolDef) {
      toolEntries.push({
        name: toolDef.name,
        source: currentSource,
      });
    },
    addPrompt() {},
    addResource() {},
    addResourceTemplate() {},
  };

  const pluginEntries = plugins.map((plugin) => ({
    name: plugin.name,
    source: `plugin:${plugin.name}@${plugin.version}`,
  }));
  duplicates.push(...findDuplicates('plugin', pluginEntries));

  const seenPluginNames = new Set<string>();
  const registry = new McpRegistry(collector as never);
  const core = new AppiumMcpCore();

  currentSource = CORE_SOURCE;
  try {
    withSuppressedRegistrationLogs(() => registerTools(collector as never));
  } catch (err: unknown) {
    errors.push({
      source: currentSource,
      message: errorMessage(err),
    });
  }

  for (const plugin of plugins) {
    if (seenPluginNames.has(plugin.name)) {
      continue;
    }
    seenPluginNames.add(plugin.name);
    if (typeof plugin.register !== 'function') {
      continue;
    }
    currentSource = `plugin:${plugin.name}`;
    try {
      plugin.register(registry, core);
    } catch (err: unknown) {
      errors.push({
        source: currentSource,
        message: errorMessage(err),
      });
    }
  }
  duplicates.push(...findDuplicates('tool', toolEntries));

  return {
    ok: duplicates.length === 0 && errors.length === 0,
    pluginCount: new Set(pluginEntries.map((entry) => entry.name)).size,
    toolCount: toolEntries.length,
    duplicates,
    errors,
  };
}

export function formatVerificationReport(report: VerificationReport): string {
  const lines = [
    `Checked ${report.pluginCount} plugin name(s) and ${report.toolCount} tool name(s).`,
  ];

  if (report.ok) {
    lines.push('No duplicate plugin or tool names found.');
    return lines.join('\n');
  }

  if (report.duplicates.length > 0) {
    lines.push('Duplicate names found:');
    for (const duplicate of report.duplicates) {
      const sources = duplicate.entries
        .map((entry) => `    - ${entry.source}`)
        .join('\n');
      lines.push(`  ${duplicate.kind}: ${duplicate.name}\n${sources}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push('Registration/load errors found:');
    for (const error of report.errors) {
      lines.push(`  ${error.source}: ${error.message}`);
    }
  }

  return lines.join('\n');
}

function withSuppressedRegistrationLogs(fn: () => void): void {
  const mutableLog = log as typeof log & { info: (...args: unknown[]) => void };
  const originalInfo = mutableLog.info;
  mutableLog.info = () => {};
  try {
    fn();
  } finally {
    mutableLog.info = originalInfo;
  }
}

function findDuplicates(
  kind: VerificationDuplicateKind,
  entries: VerificationEntry[]
): VerificationDuplicate[] {
  const byName = new Map<string, VerificationEntry[]>();
  for (const entry of entries) {
    const existing = byName.get(entry.name) ?? [];
    existing.push(entry);
    byName.set(entry.name, existing);
  }

  return Array.from(byName.entries())
    .filter(([, duplicateEntries]) => duplicateEntries.length > 1)
    .map(([name, duplicateEntries]) => ({
      kind,
      name,
      entries: duplicateEntries,
    }));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
