import { describe, expect, jest, test } from '@jest/globals';
import type { AppiumMcpPlugin } from '../plugin.js';

await jest.unstable_mockModule('appium-uiautomator2-driver', () => ({
  AndroidUiautomator2Driver: class MockAndroidUiautomator2Driver {},
}));

await jest.unstable_mockModule('appium-xcuitest-driver', () => ({
  XCUITestDriver: class MockXCUITestDriver {},
}));

await jest.unstable_mockModule('../tools/index', () => ({
  default: (server: { addTool: (toolDef: { name: string }) => void }) => {
    server.addTool({ name: 'builtin_tool' });
    server.addTool({ name: 'another_builtin_tool' });
  },
}));

const { formatVerificationReport, verifyAppiumMcpNames } =
  await import('../plugin.js');

describe('verifyAppiumMcpNames', () => {
  test('passes when plugin and tool names are unique', () => {
    const plugin: AppiumMcpPlugin = {
      name: 'unique-plugin',
      version: '1.0.0',
      register(registry) {
        registry.addTool({
          name: 'plugin_tool',
          description: 'plugin tool',
          parameters: {} as never,
          execute: async () => ({
            content: [{ type: 'text', text: 'ok' }],
          }),
        });
      },
    };

    const report = verifyAppiumMcpNames({ plugins: [plugin] });

    expect(report.ok).toBe(true);
    expect(report.duplicates).toEqual([]);
    expect(report.pluginCount).toBe(1);
    expect(report.toolCount).toBe(3);
    expect(report.errors).toEqual([]);
  });

  test('reports duplicate plugin names', () => {
    const plugins: AppiumMcpPlugin[] = [
      { name: 'duplicate-plugin', version: '1.0.0' },
      { name: 'duplicate-plugin', version: '2.0.0' },
    ];

    const report = verifyAppiumMcpNames({ plugins });

    expect(report.ok).toBe(false);
    expect(report.duplicates).toEqual([
      {
        kind: 'plugin',
        name: 'duplicate-plugin',
        entries: [
          {
            name: 'duplicate-plugin',
            source: 'plugin:duplicate-plugin@1.0.0',
          },
          {
            name: 'duplicate-plugin',
            source: 'plugin:duplicate-plugin@2.0.0',
          },
        ],
      },
    ]);
    expect(report.errors).toEqual([]);
  });

  test('reports duplicate tool names across plugins and built-ins', () => {
    const plugin: AppiumMcpPlugin = {
      name: 'conflicting-plugin',
      version: '1.0.0',
      register(registry) {
        registry.addTool({
          name: 'builtin_tool',
          description: 'conflicting tool',
          parameters: {} as never,
          execute: async () => ({
            content: [{ type: 'text', text: 'ok' }],
          }),
        });
      },
    };

    const report = verifyAppiumMcpNames({ plugins: [plugin] });

    expect(report.ok).toBe(false);
    expect(report.duplicates).toEqual([
      {
        kind: 'tool',
        name: 'builtin_tool',
        entries: [
          { name: 'builtin_tool', source: 'appium-mcp core' },
          { name: 'builtin_tool', source: 'plugin:conflicting-plugin' },
        ],
      },
    ]);
    expect(report.errors).toEqual([]);
  });

  test('collects plugin registration errors and continues checking tools', () => {
    const plugins: AppiumMcpPlugin[] = [
      {
        name: 'broken-plugin',
        version: '1.0.0',
        register() {
          throw new Error('plugin setup failed');
        },
      },
      {
        name: 'working-plugin',
        version: '1.0.0',
        register(registry) {
          registry.addTool({
            name: 'working_plugin_tool',
            description: 'working tool',
            parameters: {} as never,
            execute: async () => ({
              content: [{ type: 'text', text: 'ok' }],
            }),
          });
        },
      },
    ];

    const report = verifyAppiumMcpNames({ plugins });

    expect(report.ok).toBe(false);
    expect(report.toolCount).toBe(3);
    expect(report.duplicates).toEqual([]);
    expect(report.errors).toEqual([
      {
        source: 'plugin:broken-plugin',
        message: 'plugin setup failed',
      },
    ]);
  });
});

describe('formatVerificationReport', () => {
  test('formats passing reports', () => {
    const report = verifyAppiumMcpNames();

    expect(formatVerificationReport(report)).toBe(
      'Checked 0 plugin name(s) and 2 tool name(s).\n' +
        'No duplicate plugin or tool names found.'
    );
  });

  test('formats error reports', () => {
    expect(
      formatVerificationReport({
        ok: false,
        pluginCount: 1,
        toolCount: 2,
        duplicates: [],
        errors: [{ source: 'appium-mcp core', message: 'AI config missing' }],
      })
    ).toBe(
      'Checked 1 plugin name(s) and 2 tool name(s).\n' +
        'Registration/load errors found:\n' +
        '  appium-mcp core: AI config missing'
    );
  });
});
