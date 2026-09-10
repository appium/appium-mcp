import {createRequire} from 'node:module';
import {isAbsolute, resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';

import type {AppiumMcpPlugin} from '../core.js';
import {CLI_OPTIONS, CLI_VALUE_PREFIXES} from './options.js';

// Require a runtime check for every field in the plugin contract.
const PLUGIN_FIELD_TYPES = {
  name: 'string',
  version: 'string',
  initialize: 'function',
  register: 'function',
  beforeCall: 'function',
  afterCall: 'function',
  destroy: 'function',
} as const satisfies {
  [Key in keyof AppiumMcpPlugin]-?: NonNullable<AppiumMcpPlugin[Key]> extends string ? 'string' : 'function';
};

type ResolvePackage = (specifier: string) => string;
type PluginConstructor = new () => unknown;

/** Load explicitly requested plugins in command-line order, relative to the caller. */
export async function loadCliPlugins(args: readonly string[], cwd = process.cwd()): Promise<AppiumMcpPlugin[]> {
  const specifiers = parsePluginSpecifiers(args);
  const requireFromCwd = createRequire(resolvePath(cwd, 'package.json'));
  const plugins: AppiumMcpPlugin[] = [];
  for (const specifier of specifiers) {
    // Imports and constructors can have side effects, so preserve flag order.
    plugins.push(await loadPlugin(specifier, cwd, requireFromCwd.resolve));
  }
  return plugins;
}

function parsePluginSpecifiers(args: readonly string[]): string[] {
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

function resolvePluginUrl(specifier: string, cwd: string, resolvePackage: ResolvePackage): string {
  let moduleSpecifier: string;
  if (isAbsolute(specifier) || specifier.startsWith('.')) {
    moduleSpecifier = resolvePath(cwd, specifier);
  } else if (URL.canParse(specifier)) {
    moduleSpecifier = new URL(specifier).href;
  } else {
    moduleSpecifier = resolvePackage(specifier);
  }

  const moduleURL = isAbsolute(moduleSpecifier) ? pathToFileURL(moduleSpecifier).href : moduleSpecifier;
  if (!moduleURL.startsWith('file:')) {
    throw new Error('Only local files and installed packages are supported.');
  }
  return moduleURL;
}

async function loadPlugin(specifier: string, cwd: string, resolvePackage: ResolvePackage): Promise<AppiumMcpPlugin> {
  try {
    const moduleURL = resolvePluginUrl(specifier, cwd, resolvePackage);
    const module = (await import(moduleURL)) as {default?: unknown};
    const exported = module.default;
    const plugin = typeof exported === 'function' ? new (exported as PluginConstructor)() : exported;
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
  for (const [field, expectedType] of Object.entries(PLUGIN_FIELD_TYPES)) {
    const value = candidate[field];
    if (expectedType === 'string') {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`The plugin must have a non-empty string "${field}".`);
      }
    } else if (value !== undefined && typeof value !== 'function') {
      throw new Error(`Plugin "${candidate.name}" has an invalid "${field}" hook; expected a function.`);
    }
  }
}
