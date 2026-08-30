import {access, readFile} from 'node:fs/promises';

import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const mockRunSimctl = jest.fn<(...args: any[]) => Promise<{stdout: string} | undefined>>();
const mockExec = jest.fn<(...args: any[]) => Promise<{stdout: string}>>();

jest.unstable_mockModule('../../../command', () => ({
  execute: jest.fn(),
  runSimctl: mockRunSimctl,
}));

jest.unstable_mockModule('../../../session-store', () => ({
  getPlatformName: jest.fn(() => 'iOS'),
  isRemoteDriverSession: jest.fn(() => false),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isXCUITestDriverSession: jest.fn(() => true),
  PLATFORM: {ios: 'iOS', android: 'Android'},
}));

jest.unstable_mockModule('../../../tools/tool-response', () => ({
  resolveDriver: jest.fn(),
  textResult: jest.fn(),
  errorResult: jest.fn(),
  toolErrorMessage: jest.fn(),
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils', () => ({
  createUIResource: jest.fn(),
  createAppListUI: jest.fn(),
  addUIResourceToResponse: jest.fn(),
}));

jest.unstable_mockModule('teen_process', () => ({exec: mockExec}));

const {listAppsFromDevice} = await import('../../../tools/app-management/list-apps.js');

describe('listAppsFromDevice', () => {
  const driver = {
    caps: {udid: 'simulator-udid'},
    isSimulator: jest.fn(() => true),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('converts the plist returned by simctl and removes the temporary file', async () => {
    const plist = '<?xml version="1.0"?><plist><dict/></plist>';
    let temporaryPlistPath: string | undefined;

    mockRunSimctl.mockResolvedValue({stdout: plist});
    mockExec.mockImplementation(async (_command, args) => {
      temporaryPlistPath = String(args.at(-1));
      expect(await readFile(temporaryPlistPath, 'utf8')).toBe(plist);
      return {
        stdout: JSON.stringify({
          'com.example.app': {CFBundleDisplayName: 'Example'},
        }),
      };
    });

    await expect(listAppsFromDevice(driver as never)).resolves.toEqual([
      {packageName: 'com.example.app', appName: 'Example'},
    ]);

    expect(mockRunSimctl).toHaveBeenCalledWith(driver, 'listapps', [], 5000);
    expect(mockExec).toHaveBeenCalledWith(
      'plutil',
      ['-convert', 'json', '-o', '-', '--', expect.stringMatching(/listapps\.plist$/)],
      {timeout: 5000},
    );
    expect(temporaryPlistPath).toBeDefined();
    if (!temporaryPlistPath) {
      throw new Error('plutil was not called with a temporary plist path');
    }
    await expect(access(temporaryPlistPath)).rejects.toThrow();
  });
});
