/**
 * Plugin API for Appium MCP
 *
 * Exposes a stable plugin interface that lets users add custom tools and lifecycle
 * hooks without forking the server. Follows composition-over-inheritance and mirrors
 * the Appium plugin model (beforeCommand/afterCommand) and MCP Proxy Wrapper hooks
 * (beforeToolCall / afterToolCall / initialize / destroy).
 *
 * Three-layer architecture:
 *   1. Core layer   – session management, Appium integration, context, locators (session-store.ts)
 *   2. Server layer – official general-purpose Appium MCP server (server.ts)
 *   3. Plugin layer – THIS file; stable APIs for custom tools and hooks
 *
 * @example
 * ```ts
 * import { createAppiumMcpServer, AppiumMcpPlugin } from 'appium-mcp/core';
 *
 * const server = createAppiumMcpServer({
 *   plugins: [new MyPlugin()],
 * });
 * await server.start({ transportType: 'stdio' });
 * ```
 */

import type { ContentResult, FastMCP } from 'fastmcp';
import type { DriverInstance } from './session-store.js';
import { getDriver, listSessions } from './session-store.js';
import log from './logger.js';

// ---------------------------------------------------------------------------
// Public type surface – these types are intentionally stable
// ---------------------------------------------------------------------------

/**
 * Opaque context passed to `initialize` and shared across hooks during the
 * server lifetime. Provides read-only access to server metadata.
 */
export interface PluginContext {
  /** The FastMCP server instance – allows advanced users to add extra tools. */
  readonly server: FastMCP;
  /** Map of plugin name → plugin instance for inter-plugin access. */
  readonly plugins: ReadonlyMap<string, AppiumMcpPlugin>;
}

/**
 * Contextual information available to `beforeToolCall` and `afterToolCall`
 * hooks at the moment a tool is invoked.
 */
export interface ToolCallContext {
  /** Name of the tool being invoked. */
  readonly toolName: string;
  /** Arguments passed to the tool (a shallow copy; do not mutate). */
  readonly args: Readonly<Record<string, unknown>>;
  /**
   * Session facade that gives plugins safe access to the active Appium session
   * without directly coupling to the raw driver internals.
   */
  readonly session: PluginSessionContext;
}

/**
 * Facade over the Appium session, provided to plugins so they can inspect or
 * interact with the device without importing raw driver internals.
 */
export interface PluginSessionContext {
  /**
   * Returns the currently active sessionId, or `null` when no session exists.
   */
  getSessionId(): string | null;

  /**
   * Returns the raw driver for the provided (or active) session.
   * May be `null` when no session is active.
   */
  getDriver(sessionId?: string): DriverInstance | null;

  /**
   * Snapshot of all sessions currently tracked by the server.
   */
  listSessions(): ReturnType<typeof listSessions>;
}

/**
 * The shape of a tool result returned from – or modified by – a plugin hook.
 */
export interface ToolCallResult {
  isError: boolean;
  content: ContentResult['content'];
}

/**
 * The core plugin interface.
 *
 * All lifecycle methods are optional. Implement only those you need:
 *
 * - `initialize`    – called once after all built-in tools are registered.
 * - `registerTools` – called during initialization; use the registry to add tools.
 * - `beforeToolCall`– interceptor called before every tool execute.
 * - `afterToolCall` – interceptor called after every tool execute (even on error).
 * - `destroy`       – called when the server is shutting down.
 */
export interface AppiumMcpPlugin {
  /** Unique plugin name – used for logging and inter-plugin lookup. */
  readonly name: string;
  /** Semver string for your plugin package. */
  readonly version: string;

  /**
   * One-time setup hook, called after the default Appium MCP tools are
   * registered. Plugins may register additional tools here via `ctx.server`
   * or perform async initialisation.
   */
  initialize?(ctx: PluginContext): Promise<void>;

  /**
   * Register custom tools with the MCP server.
   * This is called as part of server setup, before `initialize`.
   * Prefer `registerTools` for tool registration and `initialize` for
   * other async setup work.
   */
  registerTools?(registry: ToolRegistry, core: AppiumMcpCore): void;

  /**
   * Hook invoked before a tool's `execute` function is called.
   * Return `void` to let execution proceed unchanged.
   * Return a `ToolCallResult` to short-circuit execution and use your result instead.
   */
  beforeToolCall?(ctx: ToolCallContext): Promise<ToolCallResult | void>;

  /**
   * Hook invoked after a tool's `execute` function resolves (or rejects).
   * Receives the result (including error results). May return a modified
   * `ToolCallResult` to replace the original, or `void` to pass through.
   */
  afterToolCall?(
    ctx: ToolCallContext,
    result: ToolCallResult
  ): Promise<ToolCallResult | void>;

  /**
   * Called when the MCP server is shutting down. Use for resource cleanup.
   */
  destroy?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// ToolRegistry – thin wrapper over FastMCP.addTool
// ---------------------------------------------------------------------------

/**
 * Stable abstraction over `FastMCP.addTool` for use by plugins.
 * Shields plugin authors from internal FastMCP API changes.
 */
export class ToolRegistry {
  constructor(private readonly server: FastMCP) {}

  /**
   * Register a tool with the MCP server.
   *
   * @param name        - Tool name (must be unique across all registered tools).
   * @param description - Human-readable description shown to LLM clients.
   * @param schema      - Zod schema or JSON schema object describing the input.
   * @param handler     - Async function executed when the tool is called.
   */
  tool(
    name: string,
    description: string,
    schema: Parameters<FastMCP['addTool']>[0]['parameters'],
    handler: (
      args: Record<string, unknown>,
      ctx: { session?: unknown }
    ) => Promise<ContentResult>
  ): void {
    this.server.addTool({
      name,
      description,
      parameters: schema,
      execute: handler as Parameters<FastMCP['addTool']>[0]['execute'],
    });
  }
}

// ---------------------------------------------------------------------------
// AppiumMcpCore – read-only facade over session internals exposed to plugins
// ---------------------------------------------------------------------------

/**
 * Stable read-only facade over Appium MCP internals.
 * Passed to `registerTools` so plugins can build tools that compose
 * with the core session management layer.
 */
export class AppiumMcpCore {
  /**
   * Retrieve the raw driver for the given (or active) session.
   * Returns `null` when no session is active.
   */
  getDriver(sessionId?: string): DriverInstance | null {
    return getDriver(sessionId);
  }

  /**
   * List all currently tracked sessions.
   */
  listSessions(): ReturnType<typeof listSessions> {
    return listSessions();
  }
}

// ---------------------------------------------------------------------------
// PluginManager – internal wiring; not part of the public plugin API
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of registered plugins and wires beforeToolCall /
 * afterToolCall hooks into the FastMCP addTool interceptor.
 *
 * This class is **not** part of the public plugin API – it is implementation
 * detail of `createAppiumMcpServer`.
 */
export class PluginManager {
  private readonly pluginMap = new Map<string, AppiumMcpPlugin>();
  private readonly server: FastMCP;
  private readonly core: AppiumMcpCore;
  private ctx: PluginContext | null = null;

  constructor(server: FastMCP) {
    this.server = server;
    this.core = new AppiumMcpCore();
  }

  /**
   * Register plugins and set up the addTool interceptor so that
   * beforeToolCall / afterToolCall hooks fire around every tool call.
   */
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
        `[PluginManager] Registered plugin: ${plugin.name}@${plugin.version}`
      );
    }

    this.installAddToolInterceptor();
  }

  /**
   * Call `registerTools` on each plugin that implements it.
   * Must be called after the server is created but before `initialize`.
   */
  registerPluginTools(): void {
    const registry = new ToolRegistry(this.server);
    for (const plugin of this.pluginMap.values()) {
      if (typeof plugin.registerTools === 'function') {
        try {
          plugin.registerTools(registry, this.core);
          log.info(`[PluginManager] ${plugin.name}: registerTools() completed`);
        } catch (err) {
          log.error(
            `[PluginManager] ${plugin.name}: registerTools() threw:`,
            err
          );
        }
      }
    }
  }

  /**
   * Call `initialize` on each plugin that implements it.
   * Must be called after the built-in tools are registered.
   */
  async initialize(): Promise<void> {
    this.ctx = {
      server: this.server,
      plugins: this.pluginMap as ReadonlyMap<string, AppiumMcpPlugin>,
    };

    for (const plugin of this.pluginMap.values()) {
      if (typeof plugin.initialize === 'function') {
        try {
          await plugin.initialize(this.ctx);
          log.info(`[PluginManager] ${plugin.name}: initialize() completed`);
        } catch (err) {
          log.error(`[PluginManager] ${plugin.name}: initialize() threw:`, err);
        }
      }
    }
  }

  /**
   * Call `destroy` on each plugin in reverse registration order.
   */
  async destroy(): Promise<void> {
    const reversed = Array.from(this.pluginMap.values()).reverse();
    for (const plugin of reversed) {
      if (typeof plugin.destroy === 'function') {
        try {
          await plugin.destroy();
          log.info(`[PluginManager] ${plugin.name}: destroy() completed`);
        } catch (err) {
          log.error(`[PluginManager] ${plugin.name}: destroy() threw:`, err);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Wraps `server.addTool` so that every subsequently registered tool (both
   * built-in and plugin-provided) runs through the hook chain.
   */
  private installAddToolInterceptor(): void {
    const originalAddTool = this.server.addTool.bind(this.server);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const manager = this;

    this.server.addTool = (toolDef) => {
      const toolName = toolDef?.name ?? 'unknown_tool';
      const originalExecute = toolDef?.execute;
      if (typeof originalExecute !== 'function') {
        return originalAddTool(toolDef);
      }

      return originalAddTool({
        ...toolDef,
        execute: async (args, mcpCtx) => {
          const sessionCtx: PluginSessionContext = {
            getSessionId: () => {
              const active = listSessions().find((s) => s.isActive);
              return active?.sessionId ?? null;
            },
            getDriver: (sessionId) => getDriver(sessionId),
            listSessions,
          };

          const toolCtx: ToolCallContext = {
            toolName,
            args: args as Record<string, unknown>,
            session: sessionCtx,
          };

          // --- beforeToolCall phase ---
          for (const plugin of manager.pluginMap.values()) {
            if (typeof plugin.beforeToolCall !== 'function') {
              continue;
            }
            try {
              const override = await plugin.beforeToolCall(toolCtx);
              if (override !== undefined && override !== null) {
                log.info(
                  `[PluginManager] ${plugin.name}.beforeToolCall() short-circuited ${toolName}`
                );
                // Convert ToolCallResult back to ContentResult
                return {
                  content: override.content,
                  isError: override.isError,
                } as ContentResult;
              }
            } catch (err) {
              log.error(
                `[PluginManager] ${plugin.name}.beforeToolCall() threw for ${toolName}:`,
                err
              );
            }
          }

          // --- execute phase ---
          let rawResult: ContentResult;
          try {
            rawResult = (await originalExecute(args, mcpCtx)) as ContentResult;
          } catch (execErr) {
            const errMsg =
              execErr instanceof Error ? execErr.message : String(execErr);
            rawResult = {
              content: [{ type: 'text', text: errMsg }],
              isError: true,
            };
          }

          // --- afterToolCall phase ---
          let hookResult: ToolCallResult = {
            isError: rawResult.isError ?? false,
            content: rawResult.content as ToolCallResult['content'],
          };

          for (const plugin of manager.pluginMap.values()) {
            if (typeof plugin.afterToolCall !== 'function') {
              continue;
            }
            try {
              const modified = await plugin.afterToolCall(toolCtx, hookResult);
              if (modified !== undefined && modified !== null) {
                hookResult = modified;
              }
            } catch (err) {
              log.error(
                `[PluginManager] ${plugin.name}.afterToolCall() threw for ${toolName}:`,
                err
              );
            }
          }

          // Re-throw if the (possibly modified) result is an error so FastMCP
          // can handle it consistently, unless the original execute already
          // returned it as a non-throwing error result.
          return {
            content: hookResult.content,
            isError: hookResult.isError,
          } as ContentResult;
        },
      });
    };
  }
}
