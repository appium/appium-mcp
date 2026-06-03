import { describe, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('appium-uiautomator2-driver', () => ({
  AndroidUiautomator2Driver: class {},
}));
jest.unstable_mockModule('appium-xcuitest-driver', () => ({
  XCUITestDriver: class {},
}));
jest.unstable_mockModule('webdriver', () => ({ default: {} }));

await jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { AppiumDocumentation } =
  await import('../../../tools/documentation/plugin.js');

type ToolDef = {
  name: string;
  annotations?: unknown;
};

describe('AppiumDocumentation plugin', () => {
  test('registers documentation query and skills tools', () => {
    const tools: ToolDef[] = [];
    const registry = {
      addTool(toolDef: ToolDef) {
        tools.push(toolDef);
      },
    };

    new AppiumDocumentation().register(registry as never);

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
