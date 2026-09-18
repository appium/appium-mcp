import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';

jest.unstable_mockModule('../logger', () => ({
  default: {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}},
}));
// Make the local lookup miss even when the package is installed next to appium-mcp,
// so these tests always exercise the global lookup.
jest.unstable_mockModule(
  '@appium/mcp-documentation',
  () => {
    throw Object.assign(new Error('Cannot find package'), {code: 'ERR_MODULE_NOT_FOUND'});
  },
  {virtual: true},
);

const {loadDocumentationPlugin} = await import('../documentation.js');

const originalExecPath = process.execPath;
let directory: string;

/** Writes a minimal stand-in for @appium/mcp-documentation into the given global root. */
async function installFakeDocumentationPackage(globalRoot: string, pluginName: string): Promise<void> {
  const packageDir = join(globalRoot, '@appium', 'mcp-documentation');
  await mkdir(packageDir, {recursive: true});
  await writeFile(
    join(packageDir, 'package.json'),
    // Mirrors the real package: an ESM-only "." export plus an exported package.json.
    JSON.stringify({
      name: '@appium/mcp-documentation',
      type: 'module',
      exports: {'.': {import: './index.js'}, './package.json': './package.json'},
    }),
  );
  await writeFile(
    join(packageDir, 'index.js'),
    `export class AppiumDocumentation { name = '${pluginName}'; version = '0.0.0'; }`,
  );
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'appium-mcp-documentation-'));
});

afterEach(async () => {
  process.execPath = originalExecPath;
  await rm(directory, {recursive: true, force: true});
});

describe('loadDocumentationPlugin: global install lookup', () => {
  // Homebrew's node binary lives in <prefix>/Cellar/node/<version>/bin, while npm puts
  // global packages in <prefix>/lib/node_modules, which is not next to the binary.
  test('finds a Homebrew global install from the Cellar node binary', async () => {
    const prefix = join(directory, 'homebrew');
    await installFakeDocumentationPackage(join(prefix, 'lib', 'node_modules'), 'homebrew-docs');
    process.execPath = join(prefix, 'Cellar', 'node', '26.0.0', 'bin', 'node');

    const plugin = await loadDocumentationPlugin();

    expect(plugin?.name).toBe('homebrew-docs');
  });

  test('still finds a global install next to the node binary (nvm layout)', async () => {
    const prefix = join(directory, 'nvm', 'versions', 'node', 'v22.0.0');
    await installFakeDocumentationPackage(join(prefix, 'lib', 'node_modules'), 'nvm-docs');
    process.execPath = join(prefix, 'bin', 'node');

    const plugin = await loadDocumentationPlugin();

    expect(plugin?.name).toBe('nvm-docs');
  });

  test('returns null when a Homebrew node has no global install', async () => {
    process.execPath = join(directory, 'homebrew', 'Cellar', 'node', '26.0.0', 'bin', 'node');

    await expect(loadDocumentationPlugin()).resolves.toBeNull();
  });
});
