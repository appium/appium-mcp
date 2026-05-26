import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import log from '../logger.js';
import type { AppiumMcpPlugin } from '../plugin.js';
import {
  formatVerificationReport,
  verifyAppiumMcpNames,
  type VerificationError,
} from '../verify.js';

type PluginFactory = {
  new (): unknown;
  (): unknown;
};

/**
 * Run the verify-plugin command with the given arguments, which should be the
 * same as the arguments passed to the CLI after "verify-plugin". This is
 * exported for testing purposes, but can also be used programmatically to verify
 * plugins without invoking a separate process.
 * @param verifyArgs - The arguments to pass to the verify-plugin command.
 * @returns A promise that resolves when the verification is complete.
 */
export async function runVerifyPluginCommand(
  verifyArgs: string[]
): Promise<void> {
  const loaded = await loadPluginsFromArgs(verifyArgs);
  const report = verifyAppiumMcpNames({
    plugins: loaded.plugins,
    errors: loaded.errors,
  });
  const output = formatVerificationReport(report);
  if (report.ok) {
    log.info(output);
    return;
  }

  log.error(output);
  process.exit(1);
}

export async function loadPluginsFromArgs(
  verifyArgs: string[]
): Promise<{ plugins: AppiumMcpPlugin[]; errors: VerificationError[] }> {
  const plugins: AppiumMcpPlugin[] = [];
  const errors: VerificationError[] = [];
  for (const specifier of pluginSpecifiersFromArgs(verifyArgs)) {
    try {
      const moduleExports = await import(pluginImportSpecifier(specifier));
      plugins.push(...pluginsFromModule(moduleExports, specifier));
    } catch (err: unknown) {
      errors.push({
        source: `plugin:${specifier}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { plugins, errors };
}

export function pluginSpecifiersFromArgs(verifyArgs: string[]): string[] {
  const specifiers: string[] = [];
  for (let i = 0; i < verifyArgs.length; i += 1) {
    const arg = verifyArgs[i];
    if (arg.startsWith('--plugin=')) {
      specifiers.push(arg.slice('--plugin='.length));
    } else if (arg === '--plugin' && verifyArgs[i + 1]) {
      specifiers.push(verifyArgs[i + 1]);
      i += 1;
    }
  }
  return specifiers.filter((specifier) => specifier.length > 0);
}

export function pluginImportSpecifier(specifier: string): string {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:')
  ) {
    if (specifier.startsWith('file:')) {
      return specifier;
    }
    const absolutePath = isAbsolute(specifier)
      ? specifier
      : resolve(process.cwd(), specifier);
    return pathToFileURL(absolutePath).href;
  }
  return specifier;
}

export function pluginsFromModule(
  moduleExports: Record<string, unknown>,
  specifier: string
): AppiumMcpPlugin[] {
  const candidates = [
    moduleExports.default,
    moduleExports.plugins,
    moduleExports.plugin,
  ];
  const plugins: AppiumMcpPlugin[] = [];
  for (const candidate of candidates) {
    plugins.push(...pluginsFromCandidate(candidate, specifier));
  }
  if (plugins.length === 0) {
    throw new Error(
      'No Appium MCP plugin export found. Expected default, plugin, or plugins.'
    );
  }
  return plugins;
}

function pluginsFromCandidate(
  candidate: unknown,
  specifier: string
): AppiumMcpPlugin[] {
  if (candidate == null) {
    return [];
  }
  if (Array.isArray(candidate)) {
    return candidate.flatMap((item) => pluginsFromCandidate(item, specifier));
  }
  const plugin =
    typeof candidate === 'function'
      ? instantiatePlugin(candidate as PluginFactory, specifier)
      : candidate;
  if (isAppiumMcpPlugin(plugin)) {
    return [plugin];
  }
  throw new Error(
    `Export from ${specifier} is not an Appium MCP plugin: missing string name/version.`
  );
}

function instantiatePlugin(
  pluginFactory: PluginFactory,
  specifier: string
): unknown {
  try {
    return new pluginFactory();
  } catch (constructorErr: unknown) {
    try {
      return pluginFactory();
    } catch (factoryErr: unknown) {
      const constructorMessage =
        constructorErr instanceof Error
          ? constructorErr.message
          : String(constructorErr);
      const factoryMessage =
        factoryErr instanceof Error ? factoryErr.message : String(factoryErr);
      throw new Error(
        `Could not instantiate plugin export from ${specifier}. ` +
          `new export() failed: ${constructorMessage}; export() failed: ${factoryMessage}`,
        { cause: factoryErr }
      );
    }
  }
}

function isAppiumMcpPlugin(value: unknown): value is AppiumMcpPlugin {
  return (
    value != null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string' &&
    'version' in value &&
    typeof (value as { version?: unknown }).version === 'string'
  );
}
