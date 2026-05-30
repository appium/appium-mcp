import { describe, expect, jest, test } from '@jest/globals';

await jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { AppiumDocument } =
  await import('../../../tools/documentation/plugin.js');

type ToolDef = {
  name: string;
  annotations?: unknown;
};

describe('AppiumDocument plugin', () => {
  test('registers documentation query and skills tools', () => {
    const tools: ToolDef[] = [];
    const registry = {
      addTool(toolDef: ToolDef) {
        tools.push(toolDef);
      },
    };

    new AppiumDocument().register(registry as never);

    expect(tools.map((tool) => tool.name)).toEqual([
      'appium_documentation_query',
      'appium_skills',
    ]);
    expect(tools[1].annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });
});
