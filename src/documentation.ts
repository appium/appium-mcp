/**
 * Optional Appium documentation plugin (RAG docs query + skills tools).
 *
 * The documentation feature lives in a separate package, `@appium/mcp-documentation`,
 * which carries a multi-megabyte embeddings cache and pulls in a heavy ML stack
 * (`@xenova/transformers`, `@langchain/*`). To keep the default install lean, that
 * package is declared as an OPTIONAL peer dependency: it is not installed by
 * default, and nothing related to it is downloaded unless the user opts in.
 *
 * Contract:
 *   - `APPIUM_MCP_DOCS_ENABLED` unset / not truthy → docs tools are NOT registered.
 *     This is the default; nothing extra is loaded.
 *   - `APPIUM_MCP_DOCS_ENABLED` truthy → the plugin is loaded if
 *     `@appium/mcp-documentation` is installed. If it is not installed, the server
 *     logs an actionable install hint and starts normally without the docs tools.
 *
 * Installation is intentionally left to the user's package manager (run at install
 * time, where it belongs) rather than shelled out from the running server: that
 * dedupes against appium-mcp's existing dependencies, works across npm/pnpm/yarn,
 * and never blocks server startup.
 */

import type { AppiumMcpPlugin } from './core.js';
import log from './logger.js';

const ENABLED_FLAG = 'APPIUM_MCP_DOCS_ENABLED';
const PACKAGE_NAME = '@appium/mcp-documentation';

/** True when the user has opted into the documentation tools. */
export function isDocumentationEnabled(): boolean {
  const raw = process.env[ENABLED_FLAG]?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/**
 * Load the documentation plugin when the user has opted in.
 *
 * @returns the plugin instance, or `null` if the optional package is not
 * installed or fails to load (in which case the server runs without the
 * documentation tools).
 */
export async function loadDocumentationPlugin(): Promise<AppiumMcpPlugin | null> {
  try {
    // Widen to `string` so TypeScript treats this as a fully dynamic import and
    // does not require @appium/mcp-documentation to be resolvable at build time
    // (it is an optional, opt-in dependency, not installed by default).
    const specifier: string = PACKAGE_NAME;
    const mod = (await import(specifier)) as {
      AppiumDocumentation: new () => AppiumMcpPlugin;
    };
    const plugin = new mod.AppiumDocumentation();
    log.info(`Documentation tools enabled (${PACKAGE_NAME} loaded).`);
    return plugin;
  } catch (err) {
    if (isModuleNotFound(err)) {
      log.warn(
        `${ENABLED_FLAG} is set but ${PACKAGE_NAME} is not installed. ` +
          'The documentation tools (appium_documentation_query, appium_skills) ' +
          'will be unavailable. Install the package to enable them:\n' +
          `  npm install ${PACKAGE_NAME}`
      );
    } else {
      log.error(`${PACKAGE_NAME} is installed but failed to load:`, err);
    }
    return null;
  }
}

function isModuleNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) {
    return false;
  }
  const code = (err as { code?: unknown }).code;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}
