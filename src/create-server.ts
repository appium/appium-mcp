/**
 * createAppiumMcpServer — public factory for custom Appium MCP servers.
 *
 * Usage:
 * ```ts
 * import { createAppiumMcpServer } from 'appium-mcp/core';
 *
 * const server = createAppiumMcpServer({
 *   plugins: [new CheckoutPlugin(), new LoginGuardPlugin()],
 * });
 *
 * await server.start({ transportType: 'stdio' });
 * ```
 */

import { FastMCP } from 'fastmcp';
import pkg from '../package.json' with { type: 'json' };
import registerTools from './tools/index.js';
import registerResources from './resources/index.js';
import { safeDeleteAllSessions, listSessions } from './session-store.js';
import log from './logger.js';
import { PluginManager } from './plugin.js';
import type { AppiumMcpPlugin } from './plugin.js';

const SERVER_VERSION = pkg.version as `${number}.${number}.${number}`;

const SERVER_INSTRUCTIONS = [
  'Appium mobile automation through MCP. Defaults that avoid broken flows:',
  '- Establish a driver session first: select_device and appium_session_management (action=create) for local/embedded mode, or attach to a remote session when the user supplies a server URL.',
  '- Call only tools this server actually registers (appium_find_element, appium_gesture, appium_session_management, etc.); do not invent tool names or aliases.',
  '- Prefer stable locators: accessibility id and id before long xpath; use xpath only when nothing else works.',
  '- Use appium_gesture for taps and drags; when something is off-screen, use action=scroll_to_element instead of spamming appium_find_element alone.',
  '- For local Appium install, doctor, or smoke tests, run appium_skills before guessing commands.',
].join('\n');

export interface CreateAppiumMcpServerOptions {
  /**
   * List of plugins to register with the server.
   * Plugin names should be unique; duplicate names are skipped with a warning.
   * Plugins are initialized in registration order.
   */
  plugins?: AppiumMcpPlugin[];

  /**
   * Override the server name shown to MCP clients.
   * @default 'MCP Appium'
   */
  serverName?: string;

  /**
   * Override the server version shown to MCP clients.
   * @default package.json version
   */
  serverVersion?: `${number}.${number}.${number}`;

  /**
   * Additional instructions appended to the default SERVER_INSTRUCTIONS.
   */
  additionalInstructions?: string;
}

type DisconnectSessionPolicy = 'delete_all' | 'skip';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Factory function that creates and wires a fully-configured Appium MCP server,
 * with optional plugin support.
 *
 * This is the main public entry point for building a custom Appium-based MCP
 * server.  It replicates the setup that the default `server.ts` performs, while
 * also registering plugin tools and lifecycle hooks.
 *
 * @returns A configured `FastMCP` instance ready to be `start()`-ed.
 */
export function createAppiumMcpServer(
  options: CreateAppiumMcpServerOptions = {}
): FastMCP {
  const {
    plugins = [],
    serverName = 'MCP Appium',
    serverVersion = SERVER_VERSION,
    additionalInstructions,
  } = options;

  const instructions = additionalInstructions
    ? `${SERVER_INSTRUCTIONS}\n${additionalInstructions}`
    : SERVER_INSTRUCTIONS;

  const server = new FastMCP({
    name: serverName,
    version: serverVersion,
    instructions,
  });

  // -------------------------------------------------------------------------
  // 1. Install plugin hooks BEFORE registering any tools so that every built-in
  //    and plugin tool is wrapped with beforeCall / afterCall.
  // -------------------------------------------------------------------------
  const manager = new PluginManager(server);
  if (plugins.length > 0) {
    manager.register(plugins);
  }

  // -------------------------------------------------------------------------
  // 2. Register plugin tools (before built-ins so plugins appear first in the
  //    tool list, but either order is fine – adjust if needed).
  // -------------------------------------------------------------------------
  manager.registerPluginCapabilities();

  // -------------------------------------------------------------------------
  // 3. Register built-in Appium MCP resources and tools.
  // -------------------------------------------------------------------------
  registerResources(server);
  registerTools(server);

  // -------------------------------------------------------------------------
  // 4. Initialize plugins (after all tools are registered so plugins can look
  //    up built-in tools via the PluginContext if needed).
  // -------------------------------------------------------------------------
  let activeClientCount = 0;
  let pluginInitialized = false;

  // Track plugin initialization and destruction promises to avoid race conditions
  // when clients connect/disconnect in quick succession.
  let pluginInitializePromise: Promise<void> | null = null;
  let pluginDestroyPromise: Promise<void> | null = null;

  /**
   * To avoid unnecessary plugin initialization and destruction when clients connect and disconnect,
   * we lazily initialize plugins on the first client connection, and only destroy plugins
   * after the last client disconnects.
   * @returns
   */
  const ensurePluginsInitialized = async (): Promise<void> => {
    if (plugins.length === 0) {
      return;
    }

    if (pluginDestroyPromise != null) {
      await pluginDestroyPromise;
    }

    if (pluginInitialized) {
      return;
    }

    pluginInitializePromise ??= (async () => {
      try {
        await manager.initialize();
        pluginInitialized = true;
      } finally {
        pluginInitializePromise = null;
      }
    })();

    await pluginInitializePromise;
  };

  /**
   * Destroys plugins only if there are no active clients and plugins have been initialized.
   * @returns
   */
  const destroyPluginsIfIdle = async (): Promise<void> => {
    if (plugins.length === 0) {
      return;
    }

    if (pluginInitializePromise != null) {
      await pluginInitializePromise;
    }

    if (activeClientCount > 0 || !pluginInitialized) {
      return;
    }

    pluginDestroyPromise ??= (async () => {
      try {
        await manager.destroy();
        pluginInitialized = false;
      } finally {
        pluginDestroyPromise = null;
      }
    })();

    await pluginDestroyPromise;
  };

  // -------------------------------------------------------------------------
  // 5. Wire connect / disconnect lifecycle events.
  // -------------------------------------------------------------------------
  server.on('connect', async (event) => {
    log.info('Client connected:', event.session);
    activeClientCount += 1;

    // Lazy plugin initialization on first connection.
    await ensurePluginsInitialized();
  });

  server.on('disconnect', async (event) => {
    log.info('Client disconnected:', event.session);
    activeClientCount = Math.max(0, activeClientCount - 1);

    if (activeClientCount > 0) {
      return;
    }

    const policy = disconnectSessionPolicyFromEnv();
    const ownedSessions = listSessions().filter(
      (session) => session.ownership === 'owned'
    );

    if (ownedSessions.length > 0 && policy === 'skip') {
      log.info(
        `${ownedSessions.length} owned session(s) retained after MCP disconnect ` +
          '(APPIUM_MCP_ON_CLIENT_DISCONNECT=skip).'
      );
    } else if (ownedSessions.length > 0) {
      try {
        log.info(
          `${ownedSessions.length} owned session(s) detected on disconnect, cleaning up...`
        );
        const deletedCount = await safeDeleteAllSessions();
        log.info(
          `${deletedCount} session(s) cleaned up successfully on disconnect.`
        );
      } catch (error) {
        log.error('Error cleaning up session on disconnect:', error);
      }
    }

    // Destroy plugins when the last MCP client disconnects.
    await destroyPluginsIfIdle();
  });

  return server;
}

function disconnectSessionPolicyFromEnv(): DisconnectSessionPolicy {
  const raw = process.env.APPIUM_MCP_ON_CLIENT_DISCONNECT?.trim().toLowerCase();
  if (raw === 'skip') {
    return 'skip';
  }
  if (raw !== 'delete_all') {
    log.warn(
      `APPIUM_MCP_ON_CLIENT_DISCONNECT="${raw}" is not recognized; defaulting to delete_all`
    );
  }
  return 'delete_all';
}
