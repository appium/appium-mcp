import {beforeEach, describe, test, expect, jest} from '@jest/globals';

const mockDriver = {};

jest.unstable_mockModule('../../../session-store', () => ({
  getPlatformName: jest.fn(() => 'iOS'),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isXCUITestDriverSession: jest.fn(() => false),
  isRemoteDriverSession: jest.fn(() => true),
  PLATFORM: {ios: 'iOS', android: 'Android'},
}));

jest.unstable_mockModule('../../../command', () => ({
  execute: jest.fn(async () => undefined),
}));

jest.unstable_mockModule('../../../tools/tool-response', () => ({
  resolveDriver: jest.fn(async () => ({ok: true, driver: mockDriver})),
  textResult: (text: string) => ({content: [{type: 'text', text}]}),
  errorResult: (text: string) => ({
    content: [{type: 'text', text}],
    isError: true,
  }),
  toolErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const {getPlatformName} = await import('../../../session-store.js');
const {execute} = await import('../../../command.js');

const mockGetPlatformName = getPlatformName as jest.MockedFunction<typeof getPlatformName>;
const mockExecute = execute as jest.MockedFunction<typeof execute>;

describe('appium_mobile_press_key tool', () => {
  const mockServer = {addTool: jest.fn()} as any;

  async function getToolExecute() {
    const {default: pressKeyTool} = await import('../../../tools/interactions/press-key.js');
    pressKeyTool(mockServer);
    return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(-1)?.[0];
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects an Android keyCode on iOS instead of pressing HOME', async () => {
    mockGetPlatformName.mockReturnValue('iOS');
    const tool = await getToolExecute();

    const result = await tool.execute({keyCode: 4}, undefined);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('keyCode is Android-only');
    expect(result.content[0].text).toContain("Current session platform is 'iOS'");
    expect(result.content[0].text).toContain('HOME');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('presses the mapped iOS button for a logical key', async () => {
    mockGetPlatformName.mockReturnValue('iOS');
    const tool = await getToolExecute();

    const result = await tool.execute({key: 'VOLUME_UP'}, undefined);

    expect(result.isError).toBeFalsy();
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), 'mobile: pressButton', {name: 'volumeup'});
  });

  test('presses an Android keyCode', async () => {
    mockGetPlatformName.mockReturnValue('Android');
    const tool = await getToolExecute();

    const result = await tool.execute({keyCode: 24}, undefined);

    expect(result.isError).toBeFalsy();
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), 'mobile: pressKey', {keycode: 24, isLongPress: false});
  });
});
