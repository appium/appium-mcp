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
 *     `@appium/mcp-documentation` is installed (locally next to appium-mcp OR in
 *     the global npm root). If it cannot be found, the server logs an actionable
 *     install hint and starts normally without the docs tools.
 *
 * Installation is intentionally left to the user's package manager (run at install
 * time, where it belongs) rather than shelled out from the running server: that
 * dedupes against appium-mcp's existing dependencies, works across npm/pnpm/yarn,
 * and never blocks server startup.
 */

import { fs } from '@appium/support';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppiumMcpPlugin } from './core.js';
import log from './logger.js';
import { isTruthyEnvValue } from './utils/env.js';

const ENABLED_FLAG = 'APPIUM_MCP_DOCS_ENABLED';
const PACKAGE_NAME = '@appium/mcp-documentation';

interface DocumentationModule {
  AppiumDocumentation: new () => AppiumMcpPlugin;
}

/** True when the user has opted into the documentation tools. */
export function isDocumentationEnabled(): boolean {
  return isTruthyEnvValue(process.env[ENABLED_FLAG]);
}

/**
 * Load the documentation plugin when the user has opted in.
 *
 * @returns the plugin instance, or `null` if the optional package cannot be
 * found or fails to load (in which case the server runs without the docs tools).
 */
export async function loadDocumentationPlugin(): Promise<AppiumMcpPlugin | null> {
  let mod: DocumentationModule | null;
  try {
    mod = await importDocumentationModule();
  } catch (err) {
    // Found, but threw while evaluating (broken/partial install, bad version).
    log.error(`${PACKAGE_NAME} is installed but failed to load:`, err);
    return null;
  }

  if (!mod) {
    log.warn(
      `${ENABLED_FLAG} is set but ${PACKAGE_NAME} could not be found. ` +
        'The documentation tools (appium_documentation_query, appium_skills) ' +
        'will be unavailable. Install it where appium-mcp can resolve it:\n' +
        '  - globally (recommended; works with npx / global / standalone use):\n' +
        `      npm install -g ${PACKAGE_NAME}\n` +
        '  - or, only if appium-mcp is a dependency of your project, in that project root:\n' +
        `      npm install ${PACKAGE_NAME}`
    );
    return null;
  }

  const plugin = new mod.AppiumDocumentation();
  log.info(`Documentation tools enabled (${PACKAGE_NAME} loaded).`);
  return plugin;
}

/**
 * Import the documentation module.
 *
 * @returns the module, or `null` when the package is not installed anywhere
 * resolvable. Throws only when the package WAS found but failed to evaluate.
 *
 * Resolution order:
 *   1. Standard ESM resolution from appium-mcp's location (local / co-located /
 *      hoisted installs, including pnpm/yarn).
 *   2. The global npm root — so `npm install -g @appium/mcp-documentation` works
 *      even when appium-mcp itself runs from a different location (a local
 *      checkout, a global bin, or `npx`), where the global modules are not on
 *      the default resolution path.
 */
async function importDocumentationModule(): Promise<DocumentationModule | null> {
  try {
    // Widen to `string` so TypeScript treats this as a fully dynamic import and
    // does not require @appium/mcp-documentation to be resolvable at build time
    // (it is an optional, opt-in dependency, not installed by default).
    const specifier: string = PACKAGE_NAME;
    return (await import(specifier)) as DocumentationModule;
  } catch (err) {
    if (!isModuleNotFound(err)) {
      throw err;
    }
  }

  const globalEntry = await resolveGlobalEntryUrl();
  if (!globalEntry) {
    return null;
  }
  return (await import(globalEntry)) as DocumentationModule;
}

/**
 * Locate the package in the global npm root and return a file URL to its entry
 * point, or `null` if it is not installed globally.
 *
 * We resolve the package's `package.json` (always exported) and read its entry
 * rather than resolving the package directly: the package's "." export is
 * ESM-only, so `require.resolve(PACKAGE_NAME)` fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
async function resolveGlobalEntryUrl(): Promise<string | null> {
  try {
    const require = createRequire(import.meta.url);
    const execDir = path.dirname(process.execPath);
    // npm global roots by platform (each entry is a resolution starting point,
    // so `<entry>/node_modules` is checked):
    //   - POSIX (nvm, system, Homebrew): <prefix>/lib/node_modules
    //   - Windows (node.exe in <prefix>): <prefix>/node_modules
    const paths = [path.join(execDir, '..', 'lib'), execDir];
    const pkgJsonPath = require.resolve(`${PACKAGE_NAME}/package.json`, {
      paths,
    });
    const pkgDir = path.dirname(pkgJsonPath);
    const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8')) as {
      main?: string;
      exports?: { ['.']?: { import?: string; default?: string } };
    };
    const entryRelative =
      pkg.exports?.['.']?.import ??
      pkg.exports?.['.']?.default ??
      pkg.main ??
      'index.js';
    return pathToFileURL(path.join(pkgDir, entryRelative)).href;
  } catch {
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
