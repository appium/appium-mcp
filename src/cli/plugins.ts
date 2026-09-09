import {createRequire} from 'node:module';
import {isAbsolute, resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';

import type {AppiumMcpPlugin} from '../core.js';

/** Load explicitly requested plugins in command-line order, relative to the caller. */
export async function loadCliPlugins(args: string[], cwd = process.cwd()): Promise<AppiumMcpPlugin[]> {
  const specifiers: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg !== '--plugin' && !arg.startsWith('--plugin=')) {
      continue;
    }
    const specifier = arg === '--plugin' ? args[++index] : arg.slice('--plugin='.length);
    if (!specifier?.trim() || specifier.startsWith('--')) {
      throw new Error('--plugin requires a module path or an installed package name.');
    }
    specifiers.push(specifier);
  }

  const plugins: AppiumMcpPlugin[] = [];
  const requireFromCwd = createRequire(resolvePath(cwd, 'package.json'));
  for (const specifier of specifiers) {
    try {
      const moduleSpecifier =
        isAbsolute(specifier) || specifier.startsWith('.')
          ? resolvePath(cwd, specifier)
          : URL.canParse(specifier)
            ? new URL(specifier).href
            : requireFromCwd.resolve(specifier);
      const moduleURL = isAbsolute(moduleSpecifier) ? pathToFileURL(moduleSpecifier).href : moduleSpecifier;
      if (!moduleURL.startsWith('file:')) {
        throw new Error('Only local files and installed packages are supported.');
      }
      const module = (await import(moduleURL)) as {default?: unknown};
      const exported = module.default;
      const plugin = typeof exported === 'function' ? new (exported as new () => unknown)() : exported;
      assertPlugin(plugin);
      plugins.push(plugin);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load plugin "${specifier}": ${message}`, {cause: error});
    }
  }
  return plugins;
}

function assertPlugin(plugin: unknown): asserts plugin is AppiumMcpPlugin {
  if (typeof plugin !== 'object' || plugin === null) {
    throw new Error('The default export must be an AppiumMcpPlugin object or a class with a no-argument constructor.');
  }
  const candidate = plugin as Record<string, unknown>;
  for (const field of ['name', 'version']) {
    if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
      throw new Error(`The plugin must have a non-empty string "${field}".`);
    }
  }
  for (const hook of ['initialize', 'register', 'beforeCall', 'afterCall', 'destroy']) {
    if (candidate[hook] !== undefined && typeof candidate[hook] !== 'function') {
      throw new Error(`Plugin "${candidate.name}" has an invalid "${hook}" hook; expected a function.`);
    }
  }
}
