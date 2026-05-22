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
import type { DriverInstance } from './session-store.js';
import { getDriver, listSessions } from './session-store.js';
import log from './logger.js';

export interface PluginContext {
  readonly server: FastMCP;
  readonly plugins: ReadonlyMap<string, AppiumMcpPlugin>;
}
export interface PluginSessionContext {
  getSessionId(): string | null;
  getDriver(sessionId?: string): DriverInstance | null;
  listSessions(): ReturnType<typeof listSessions>;
}
export interface ToolCallContext {
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly session: PluginSessionContext;
}
export interface ToolCallResult {
  isError: boolean;
  content: ContentResult['content'];
}

export interface AppiumMcpPlugin {
  readonly name: string;
  readonly version: string;
  initialize?(ctx: PluginContext): Promise<void>;
  register?(registry: McpRegistry, core: AppiumMcpCore): void;
  beforeCall?(ctx: ToolCallContext): Promise<ToolCallResult | void>;
  afterCall?(
    ctx: ToolCallContext,
    result: ToolCallResult
  ): Promise<ToolCallResult | void>;
  destroy?(): Promise<void>;
}

type AddToolParam = Parameters<FastMCP['addTool']>[0];

type AddPromptParam = Parameters<FastMCP['addPrompt']>[0];

type AddResourceParam = Parameters<FastMCP['addResource']>[0];

type AddResourceTemplateParam = Parameters<FastMCP['addResourceTemplate']>[0];

export class McpRegistry {
  constructor(private readonly server: FastMCP) {}

  addTool<Params extends ToolParameters>(
    name: string,
    description: string,
    parameters: Params,
    execute: Tool<FastMCPSessionAuth, Params>['execute']
  ): void {
    this.server.addTool({ name, description, parameters, execute });
  }

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

  addPrompt(prompt: AddPromptParam): void {
    this.server.addPrompt(prompt);
  }

  addPrompts(prompts: AddPromptParam[]): void {
    for (const prompt of prompts) {
      this.addPrompt(prompt);
    }
  }

  addResource(resource: AddResourceParam): void {
    this.server.addResource(resource);
  }

  addResources(resources: AddResourceParam[]): void {
    for (const resource of resources) {
      this.addResource(resource);
    }
  }

  addResourceTemplate(resourceTemplate: AddResourceTemplateParam): void {
    this.server.addResourceTemplate(resourceTemplate);
  }

  addResourceTemplates(resourceTemplates: AddResourceTemplateParam[]): void {
    for (const resourceTemplate of resourceTemplates) {
      this.addResourceTemplate(resourceTemplate);
    }
  }
}

export class AppiumMcpCore {
  getDriver(sessionId?: string): DriverInstance | null {
    return getDriver(sessionId);
  }

  listSessions(): ReturnType<typeof listSessions> {
    return listSessions();
  }
}

export class PluginManager {
  private readonly pluginMap = new Map<string, AppiumMcpPlugin>();
  private readonly server: FastMCP;
  private readonly core: AppiumMcpCore;
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
      if (typeof plugin.register === 'function') {
        plugin.register(registry, this.core);
      }
    }
  }

  async initialize(): Promise<void> {
    const ctx: PluginContext = {
      server: this.server,
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

    const originalAddTool = this.server.addTool.bind(this.server);

    this.server.addTool = (toolDef: AddToolParam): void => {
      const wrappedExecute: AddToolParam['execute'] = async (args, mcpCtx) => {
        const sessionCtx: PluginSessionContext = {
          getSessionId: () =>
            listSessions().find((s) => s.isActive)?.sessionId ?? null,
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
    };
  }
}
