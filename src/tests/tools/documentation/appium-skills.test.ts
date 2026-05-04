import { describe, test, expect, jest } from '@jest/globals';

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

const appiumSkills = (
  await import('../../../tools/documentation/appium-skills.js')
).default;

type ToolDef = {
  name: string;
  execute: (args: any, context: any) => Promise<any>;
};

function getRegisteredTool(): ToolDef {
  const addTool = jest.fn();
  const server = { addTool } as any;
  appiumSkills(server);
  expect(addTool).toHaveBeenCalledTimes(1);
  return addTool.mock.calls[0][0] as ToolDef;
}

async function runTool(args: any): Promise<string> {
  const tool = getRegisteredTool();
  const result = await tool.execute(args, {});
  expect(tool.name).toBe('appium_skills');
  expect(result?.content?.[0]?.type).toBe('text');
  return result.content[0].text as string;
}

function expectOrderedSkills(text: string, skills: string[]): void {
  expect(text).toContain('Recommended skill order:');
  for (const [index, skill] of skills.entries()) {
    expect(text).toContain(`${index + 1}. ${skill}`);
    expect(text).toContain(`--- skills/${skill}/SKILL.md ---`);
  }
  expect(text).toContain('--- AGENTS.md ---');
}

describe('appium_skills tool contract', () => {
  test('returns Android UiAutomator2 setup skills in expected order', async () => {
    const text = await runTool({
      platform: 'android',
      driver: 'uiautomator2',
      mode: 'setup',
    });

    expectOrderedSkills(text, [
      'environment-setup-node',
      'environment-setup-android',
      'environment-setup-uiautomator2',
    ]);
    expect(text).toContain('Prompt template:');
  });

  test('returns iOS XCUITest real-device setup skills including real-device config', async () => {
    const text = await runTool({
      platform: 'ios',
      driver: 'xcuitest',
      mode: 'setup',
      realDevice: true,
    });

    expectOrderedSkills(text, [
      'environment-setup-node',
      'environment-setup-xcuitest',
      'xcuitest-real-device-config',
    ]);
    expect(text).toContain('Real device: yes');
  });

  test('returns troubleshooting flow with appium-troubleshooting skill', async () => {
    const text = await runTool({
      platform: 'android',
      driver: 'uiautomator2',
      mode: 'troubleshoot',
    });

    expectOrderedSkills(text, [
      'environment-setup-node',
      'environment-setup-android',
      'environment-setup-uiautomator2',
      'appium-troubleshooting',
    ]);
    expect(text).toContain('Prompt template:');
  });

  test('includes optional skills only when applicable and reports ignored ones', async () => {
    const androidText = await runTool({
      platform: 'android',
      driver: 'espresso',
      mode: 'setup',
      includeOptional: ['ffmpeg', 'bundletool'],
    });
    expectOrderedSkills(androidText, [
      'environment-setup-node',
      'environment-setup-android',
      'environment-setup-espresso',
      'environment-setup-ffmpeg',
      'environment-setup-bundletool',
    ]);

    const iosText = await runTool({
      platform: 'ios',
      driver: 'xcuitest',
      mode: 'setup',
      includeOptional: ['bundletool'],
    });
    expect(iosText).toContain('Ignored optional skills: bundletool');
  });

  test('rejects unsupported troubleshooting driver path', async () => {
    const tool = getRegisteredTool();
    await expect(
      tool.execute(
        {
          platform: 'android',
          driver: 'espresso',
          mode: 'troubleshoot',
        },
        {}
      )
    ).rejects.toThrow('Troubleshooting guidance is currently scoped');
  });
});
