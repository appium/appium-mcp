import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const rehydratedDriver = {rehydrated: true};

const mockResolveDriver = jest.fn<(sessionId?: string) => Promise<any>>();
const mockListAppsFromDevice = jest.fn<(...args: any[]) => Promise<{packageName: string; appName: string}[]>>();
const mockGetPlatformName = jest.fn<() => string>();
const mockIsXCUITestDriverSession = jest.fn<() => boolean>();

jest.unstable_mockModule('../../../session-store', () => ({
  // The in-memory cache is empty after an MCP process recycle.
  getDriver: jest.fn(() => null),
  getSessionId: jest.fn(() => undefined),
  getPlatformName: mockGetPlatformName,
  isXCUITestDriverSession: mockIsXCUITestDriverSession,
  PLATFORM: {ios: 'iOS', android: 'Android'},
}));

jest.unstable_mockModule('../../../tools/tool-response', () => ({
  resolveDriver: mockResolveDriver,
  noActiveDriverSessionMessage: (sessionId?: string) =>
    `No active driver session${sessionId ? ` for session '${sessionId}'` : ''}.`,
}));

jest.unstable_mockModule('../../../tools/app-management/list-apps.js', () => ({
  listAppsFromDevice: mockListAppsFromDevice,
}));

const {resolveAppId} = await import('../../../tools/app-management/resolve-app-id.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlatformName.mockReturnValue('Android');
  mockIsXCUITestDriverSession.mockReturnValue(false);
  mockListAppsFromDevice.mockResolvedValue([{packageName: 'com.example.calc', appName: 'Calculator'}]);
});

describe('resolveAppId on a persisted session', () => {
  test('rehydrates the session instead of failing on an empty driver cache', async () => {
    mockResolveDriver.mockResolvedValue({ok: true, driver: rehydratedDriver});

    await expect(resolveAppId('Calculator', 'persisted-1')).resolves.toBe('com.example.calc');

    expect(mockResolveDriver).toHaveBeenCalledWith('persisted-1');
    expect(mockListAppsFromDevice).toHaveBeenCalledWith(rehydratedDriver, 'User');
  });

  test('reports no active driver session when the session cannot be resolved', async () => {
    mockResolveDriver.mockResolvedValue({ok: false, result: {content: [], isError: true}});

    await expect(resolveAppId('Calculator', 'missing')).rejects.toThrow(/No active driver session/);
    expect(mockListAppsFromDevice).not.toHaveBeenCalled();
  });
});

describe('resolveAppId on a real iOS device', () => {
  const deviceDriver = {isSimulator: () => false};

  beforeEach(() => {
    mockGetPlatformName.mockReturnValue('iOS');
    mockIsXCUITestDriverSession.mockReturnValue(true);
    mockResolveDriver.mockResolvedValue({ok: true, driver: deviceDriver});
  });

  test('keeps the apps that were listed when only one app type fails', async () => {
    mockListAppsFromDevice
      .mockResolvedValueOnce([{packageName: 'com.example.calc', appName: 'Calculator'}])
      .mockRejectedValueOnce(new Error('System app list unavailable'));

    await expect(resolveAppId('Calculator', 'device-1')).resolves.toBe('com.example.calc');
  });

  test('reports the device failure instead of caching an empty app list', async () => {
    mockListAppsFromDevice.mockRejectedValue(new Error('Could not list applications on the device'));

    await expect(resolveAppId('Calculator', 'device-2')).rejects.toThrow(/Could not list applications/);

    mockListAppsFromDevice.mockResolvedValue([{packageName: 'com.example.calc', appName: 'Calculator'}]);
    await expect(resolveAppId('Calculator', 'device-2')).resolves.toBe('com.example.calc');
  });
});
