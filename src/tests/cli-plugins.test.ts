import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import {loadCliPlugins} from '../cli/plugins.js';

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'appium-mcp-cli-plugins-'));
  await writeFile(
    join(directory, 'object #plugin.mjs'),
    "export default {name: 'object-plugin', version: '1.0.0', register() {}};",
  );
  await writeFile(
    join(directory, 'class.mjs'),
    "export default class Plugin {name = 'class-plugin'; version = '1.0.0'; register() {}}",
  );
  await writeFile(join(directory, 'commonjs.cjs'), "module.exports = {name: 'commonjs-plugin', version: '1.0.0'};");
  const packageDir = join(directory, 'node_modules', '@test', 'cli-plugin');
  await mkdir(packageDir, {recursive: true});
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@test/cli-plugin',
      type: 'module',
      exports: {import: './import.mjs', require: './plugin.mjs'},
    }),
  );
  await writeFile(
    join(packageDir, 'plugin.mjs'),
    "await Promise.resolve(); export default {name: 'package-plugin', version: '1.0.0'};",
  );
  await writeFile(join(packageDir, 'import.mjs'), "export default {name: 'import-plugin', version: '1.0.0'};");

  const importOnlyDir = join(directory, 'node_modules', 'import-only-plugin');
  await mkdir(importOnlyDir, {recursive: true});
  await writeFile(
    join(importOnlyDir, 'package.json'),
    JSON.stringify({name: 'import-only-plugin', type: 'module', exports: {import: './plugin.mjs'}}),
  );
  await writeFile(join(importOnlyDir, 'plugin.mjs'), "export default {name: 'import-only-plugin', version: '1.0.0'};");

  const commonJsDir = join(directory, 'node_modules', 'commonjs-plugin');
  await mkdir(commonJsDir, {recursive: true});
  await writeFile(join(commonJsDir, 'package.json'), JSON.stringify({name: 'commonjs-plugin', main: './plugin.cjs'}));
  await writeFile(join(commonJsDir, 'plugin.cjs'), "module.exports = {name: 'commonjs-package', version: '1.0.0'};");
});

afterAll(async () => {
  await rm(directory, {recursive: true, force: true});
});

describe('CLI plugin loading', () => {
  test('leaves existing transport arguments alone when no plugins are requested', async () => {
    await expect(loadCliPlugins(['--httpStream', '--port=8081'], directory)).resolves.toEqual([]);
  });

  test('loads objects and classes in flag order using both argument forms', async () => {
    const plugins = await loadCliPlugins(['--plugin=./class.mjs', '--plugin', './object #plugin.mjs'], directory);
    expect(plugins.map((plugin) => plugin.name)).toEqual(['class-plugin', 'object-plugin']);
    expect(plugins.every((plugin) => typeof plugin.register === 'function')).toBe(true);
  });

  test('resolves the require export from the working directory and dynamically imports ESM', async () => {
    const plugins = await loadCliPlugins(['--plugin', '@test/cli-plugin'], directory);
    expect(plugins[0].name).toBe('package-plugin');
  });

  test('resolves CommonJS package main entries from the working directory', async () => {
    const plugins = await loadCliPlugins(['--plugin', 'commonjs-plugin'], directory);
    expect(plugins[0].name).toBe('commonjs-package');
  });

  test('rejects import-only packages by name', async () => {
    await expect(loadCliPlugins(['--plugin', 'import-only-plugin'], directory)).rejects.toThrow(
      'Failed to load plugin "import-only-plugin"',
    );
  });

  test.each(['relative path', 'file URL', 'uppercase file URL'])(
    'loads an import-only package through an explicit %s',
    async (kind) => {
      const fileURL = pathToFileURL(join(directory, 'node_modules', 'import-only-plugin', 'plugin.mjs')).href;
      const specifier =
        kind === 'relative path'
          ? './node_modules/import-only-plugin/plugin.mjs'
          : kind === 'uppercase file URL'
            ? fileURL.replace('file:', 'FILE:')
            : fileURL;
      const plugins = await loadCliPlugins(['--plugin', specifier], directory);
      expect(plugins[0].name).toBe('import-only-plugin');
    },
  );

  test('accepts absolute paths, file URLs, and CommonJS plugin objects', async () => {
    const plugins = await loadCliPlugins(
      ['--plugin', join(directory, 'commonjs.cjs'), '--plugin', pathToFileURL(join(directory, 'class.mjs')).href],
      directory,
    );
    expect(plugins.map((plugin) => plugin.name)).toEqual(['commonjs-plugin', 'class-plugin']);
  });

  test.each([['--plugin'], ['--plugin='], ['--plugin', '--httpStream']])(
    'rejects a missing module: %j',
    async (...args) => {
      await expect(loadCliPlugins(args, directory)).rejects.toThrow('--plugin requires a module path');
    },
  );

  test('identifies modules that cannot be loaded', async () => {
    await expect(loadCliPlugins(['--plugin', './missing.mjs'], directory)).rejects.toThrow(
      'Failed to load plugin "./missing.mjs"',
    );
  });

  test.each([
    ['missing-default', 'export const plugin = {};', 'The default export must be'],
    ['missing-name', "export default {version: '1.0.0'};", 'non-empty string "name"'],
    ['invalid-version', "export default {name: 'invalid', version: 1};", 'non-empty string "version"'],
    ['invalid-hook', "export default {name: 'invalid', version: '1.0.0', register: true};", 'invalid "register" hook'],
    [
      'constructor-error',
      "export default class Plugin {constructor() {throw new Error('configuration needed')}}",
      'configuration needed',
    ],
  ])('rejects invalid plugin export: %s', async (name, source, message) => {
    await writeFile(join(directory, `${name}.mjs`), source);
    await expect(loadCliPlugins(['--plugin', `./${name}.mjs`], directory)).rejects.toThrow(message);
  });

  test.each(['data:text/javascript,export default {}', 'https://example.com/plugin.mjs', 'node:fs', 'fs'])(
    'rejects non-file modules: %s',
    async (specifier) => {
      await expect(loadCliPlugins(['--plugin', specifier], directory)).rejects.toThrow(
        'Only local files and installed packages are supported',
      );
    },
  );
});
