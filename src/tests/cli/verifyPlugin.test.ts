import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, jest, test } from '@jest/globals';

await jest.unstable_mockModule('../../verify', () => ({
  formatVerificationReport: jest.fn(() => 'ok'),
  verifyAppiumMcpNames: jest.fn(() => ({
    ok: true,
    pluginCount: 0,
    toolCount: 0,
    duplicates: [],
    errors: [],
  })),
}));

const {
  loadPluginsFromArgs,
  pluginImportSpecifier,
  pluginSpecifiersFromArgs,
  pluginsFromModule,
} = await import('../../cli/verifyPlugin.js');

describe('pluginSpecifiersFromArgs', () => {
  test('collects repeated plugin flags in both supported forms', () => {
    expect(
      pluginSpecifiersFromArgs([
        '--plugin=./plugin-a.js',
        '--other',
        '--plugin',
        '@scope/plugin-b',
        '--plugin=',
      ])
    ).toEqual(['./plugin-a.js', '@scope/plugin-b']);
  });
});

describe('pluginImportSpecifier', () => {
  test('keeps package specifiers unchanged', () => {
    expect(pluginImportSpecifier('@scope/plugin')).toBe('@scope/plugin');
  });

  test('converts local paths to file URLs', () => {
    expect(pluginImportSpecifier('/tmp/plugin.mjs')).toBe(
      pathToFileURL('/tmp/plugin.mjs').href
    );
  });

  test('keeps file URLs unchanged', () => {
    const url = 'file:///tmp/plugin.mjs';
    expect(pluginImportSpecifier(url)).toBe(url);
  });
});

describe('pluginsFromModule', () => {
  test('accepts default plugin objects', () => {
    const plugins = pluginsFromModule(
      {
        default: {
          name: 'default-plugin',
          version: '1.0.0',
        },
      },
      'module-a'
    );

    expect(plugins.map((plugin) => plugin.name)).toEqual(['default-plugin']);
  });

  test('accepts plugin classes and plugins arrays', () => {
    class ClassPlugin {
      readonly name = 'class-plugin';
      readonly version = '1.0.0';
    }

    const plugins = pluginsFromModule(
      {
        default: ClassPlugin,
        plugins: [
          {
            name: 'array-plugin',
            version: '1.0.0',
          },
        ],
      },
      'module-b'
    );

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'class-plugin',
      'array-plugin',
    ]);
  });

  test('rejects modules without plugin exports', () => {
    expect(() =>
      pluginsFromModule({ default: { name: 'missing-version' } }, 'bad')
    ).toThrow('missing string name/version');
  });
});

describe('loadPluginsFromArgs', () => {
  test('loads valid plugin modules and collects invalid module errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'appium-mcp-plugin-test-'));
    const pluginPath = join(dir, 'plugin.mjs');
    await writeFile(
      pluginPath,
      [
        'export default {',
        "  name: 'file-plugin',",
        "  version: '1.0.0'",
        '};',
      ].join('\n')
    );

    const loaded = await loadPluginsFromArgs([
      `--plugin=${pluginPath}`,
      '--plugin',
      join(dir, 'missing.mjs'),
    ]);

    expect(loaded.plugins.map((plugin) => plugin.name)).toEqual([
      'file-plugin',
    ]);
    expect(loaded.errors).toHaveLength(1);
    expect(loaded.errors[0].source).toBe(`plugin:${join(dir, 'missing.mjs')}`);
    expect(loaded.errors[0].message).toContain('Cannot find module');
  });
});
