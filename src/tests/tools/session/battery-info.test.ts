import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  getPlatformName: jest.fn(),
  PLATFORM: { ios: 'iOS', android: 'Android' },
}));

jest.unstable_mockModule('../../../command', () => ({
  execute: jest.fn(),
}));

jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { getDriver, getPlatformName, PLATFORM } =
  await import('../../../session-store.js');
const { execute } = await import('../../../command.js');

const mockGetDriver = getDriver as jest.MockedFunction<typeof getDriver>;
const mockGetPlatformName = getPlatformName as jest.MockedFunction<
  typeof getPlatformName
>;
const mockExecute = execute as jest.MockedFunction<typeof execute>;

describe('appium_mobile_get_battery_info tool', () => {
  const mockServer = { addTool: jest.fn() } as any;

  test('throws when no driver is active', async () => {
    const { default: batteryInfo } =
      await import('../../../tools/session/battery-info.js');
    mockGetDriver.mockReturnValue(null as any);
    batteryInfo(mockServer);

    const tool = (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
    await expect(tool.execute({}, undefined)).rejects.toThrow(
      'No driver found'
    );
  });

  test('returns formatted iOS battery info', async () => {
    const { default: batteryInfo } =
      await import('../../../tools/session/battery-info.js');
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.ios);
    mockExecute.mockResolvedValue({ level: 0.75, state: 2 } as any);

    batteryInfo(mockServer);
    const tool = (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
    const result = await tool.execute({}, undefined);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({
      platform: 'iOS',
      level: '75%',
      state: 'charging',
    });
  });

  test('returns formatted Android battery info', async () => {
    const { default: batteryInfo } =
      await import('../../../tools/session/battery-info.js');
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.android);
    mockExecute.mockResolvedValue({ level: 0.3, state: 3 } as any);

    batteryInfo(mockServer);
    const tool = (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
    const result = await tool.execute({}, undefined);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({
      platform: 'Android',
      level: '30%',
      state: 'discharging',
    });
  });

  test('returns error message when execute throws', async () => {
    const { default: batteryInfo } =
      await import('../../../tools/session/battery-info.js');
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.ios);
    mockExecute.mockRejectedValue(new Error('driver error'));

    batteryInfo(mockServer);
    const tool = (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
    const result = await tool.execute({}, undefined);

    expect(result.content[0].text).toContain('Failed to get battery info');
    expect(result.content[0].text).toContain('driver error');
  });
});
