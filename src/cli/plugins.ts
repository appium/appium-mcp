import {createRequire} from 'node:module';
import {isAbsolute, resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';

import type {AppiumMcpPlugin} from '../core.js';
import {CLI_OPTIONS, CLI_VALUE_PREFIXES} from './options.js';

const PLUGIN_FIELDS = ['name', 'version'] as const satisfies readonly (keyof AppiumMcpPlugin)[];
const PLUGIN_HOOKS = [
  'initialize',
  'register',
  'beforeCall',
  'afterCall',
  'destroy',
] as const satisfies readonly (keyof AppiumMcpPlugin)[];

/** Load explicitly requested plugins in command-line order, relative to the caller. */
export async function loadCliPlugins(args: string[], cwd = process.cwd()): Promise<AppiumMcpPlugin[]> {
  const specifiers = parsePluginSpecifiers(args);
  const requireFromCwd = createRequire(resolvePath(cwd, 'package.json'));
  const plugins: AppiumMcpPlugin[] = [];
  for (const specifier of specifiers) {
    plugins.push(await loadPlugin(specifier, cwd, requireFromCwd));
  }
  return plugins;
}

function parsePluginSpecifiers(args: string[]): string[] {
  const specifiers: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg !== CLI_OPTIONS.plugin && !arg.startsWith(CLI_VALUE_PREFIXES.plugin)) {
      continue;
    }
    const specifier = arg === CLI_OPTIONS.plugin ? args[++index] : arg.slice(CLI_VALUE_PREFIXES.plugin.length);
    if (!specifier?.trim() || specifier.startsWith('--')) {
      throw new Error(`${CLI_OPTIONS.plugin} requires a module path or an installed package name.`);
    }
    specifiers.push(specifier);
  }

  return specifiers;
}

function resolvePluginUrl(specifier: string, cwd: string, requireFromCwd: NodeJS.Require): string {
  let moduleSpecifier: string;
  if (isAbsolute(specifier) || specifier.startsWith('.')) {
    moduleSpecifier = resolvePath(cwd, specifier);
  } else if (URL.canParse(specifier)) {
    moduleSpecifier = new URL(specifier).href;
  } else {
    moduleSpecifier = requireFromCwd.resolve(specifier);
  }

  const moduleURL = isAbsolute(moduleSpecifier) ? pathToFileURL(moduleSpecifier).href : moduleSpecifier;
  if (!moduleURL.startsWith('file:')) {
    throw new Error('Only local files and installed packages are supported.');
  }
  return moduleURL;
}

async function loadPlugin(specifier: string, cwd: string, requireFromCwd: NodeJS.Require): Promise<AppiumMcpPlugin> {
  try {
    const moduleURL = resolvePluginUrl(specifier, cwd, requireFromCwd);
    const module = (await import(moduleURL)) as {default?: unknown};
    const exported = module.default;
    const plugin = typeof exported === 'function' ? new (exported as new () => unknown)() : exported;
    assertPlugin(plugin);
    return plugin;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load plugin "${specifier}": ${message}`, {cause: error});
  }
}

function assertPlugin(plugin: unknown): asserts plugin is AppiumMcpPlugin {
  if (typeof plugin !== 'object' || plugin === null) {
    throw new Error('The default export must be an AppiumMcpPlugin object or a class with a no-argument constructor.');
  }
  const candidate = plugin as Record<string, unknown>;
  for (const field of PLUGIN_FIELDS) {
    if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
      throw new Error(`The plugin must have a non-empty string "${field}".`);
    }
  }
  for (const hook of PLUGIN_HOOKS) {
    if (candidate[hook] !== undefined && typeof candidate[hook] !== 'function') {
      throw new Error(`Plugin "${candidate.name}" has an invalid "${hook}" hook; expected a function.`);
    }
  }
}
