import { describe, test, expect, jest, beforeEach } from '@jest/globals';

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

describe('appium_mobile_file', () => {
  const mockServer = { addTool: jest.fn() } as any;

  beforeEach(() => {
    (mockServer.addTool as jest.MockedFunction<any>).mockClear();
    mockExecute.mockReset();
  });

  async function registerTool() {
    const { default: fileTransfer } =
      await import('../../../tools/session/file-transfer.js');
    fileTransfer(mockServer);
    return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
  }

  test('returns error when no driver is active', async () => {
    const tool = await registerTool();
    mockGetDriver.mockReturnValue(null as any);

    const result = await tool.execute(
      { action: 'push', remotePath: '/sdcard/x.txt', payloadBase64: 'YQ==' },
      undefined
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'No active driver session. Call create_session first or pass a valid sessionId.'
    );
  });

  test('push: Android uses path and data', async () => {
    const tool = await registerTool();
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.android);
    mockExecute.mockResolvedValue(undefined);

    await tool.execute(
      {
        action: 'push',
        remotePath: '/data/local/tmp/a.txt',
        payloadBase64: 'SGVsbG8=',
      },
      undefined
    );

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      'mobile: pushFile',
      expect.objectContaining({
        path: '/data/local/tmp/a.txt',
        data: 'SGVsbG8=',
      })
    );
  });

  test('push: iOS uses remotePath and payload', async () => {
    const tool = await registerTool();
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.ios);
    mockExecute.mockResolvedValue(undefined);

    await tool.execute(
      {
        action: 'push',
        remotePath: '@com.example.app:documents/x.txt',
        payloadBase64: 'QQ==',
      },
      undefined
    );

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      'mobile: pushFile',
      expect.objectContaining({
        remotePath: '@com.example.app:documents/x.txt',
        payload: 'QQ==',
      })
    );
  });

  test('pull: Android uses path', async () => {
    const tool = await registerTool();
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.android);
    mockExecute.mockResolvedValue('YmJiYg==');

    const result = await tool.execute(
      { action: 'pull', remotePath: '/sdcard/Download/out.bin' },
      undefined
    );

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      'mobile: pullFile',
      expect.objectContaining({ path: '/sdcard/Download/out.bin' })
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.contentBase64).toBe('YmJiYg==');
    expect(parsed.platform).toBe('Android');
  });

  test('pull: iOS uses remotePath', async () => {
    const tool = await registerTool();
    mockGetDriver.mockReturnValue({} as any);
    mockGetPlatformName.mockReturnValue(PLATFORM.ios);
    mockExecute.mockResolvedValue('eHh4');

    const result = await tool.execute(
      { action: 'pull', remotePath: '@com.app:documents/f.txt' },
      undefined
    );

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      'mobile: pullFile',
      expect.objectContaining({ remotePath: '@com.app:documents/f.txt' })
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.contentBase64).toBe('eHh4');
    expect(parsed.platform).toBe('iOS');
  });
});
