import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockGetDriver = jest.fn();
const mockSetSession = jest.fn(async () => {});
const mockReadAllPersistedSessions = jest.fn(async () => []);
const mockRemovePersistedSession = jest.fn(async () => {});
const mockAttachToRemoteSession = jest.fn();
const mockGetScreenshot = jest.fn(async () => 'dGVzdA=='); // "test" base64

jest.unstable_mockModule('../../../session-store.js', () => ({
  getDriver: mockGetDriver,
  setSession: mockSetSession,
}));

jest.unstable_mockModule('../../../persistence.js', () => ({
  readAllPersistedSessions: mockReadAllPersistedSessions,
  removePersistedSession: mockRemovePersistedSession,
  isSessionPersistenceEnabled: jest.fn(() => false),
  getPersistenceDir: jest.fn(() => null),
  writePersistedSession: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../../utils/url.js', () => ({
  attachToRemoteSession: mockAttachToRemoteSession,
}));

jest.unstable_mockModule('../../../command.js', () => ({
  getScreenshot: mockGetScreenshot,
}));

jest.unstable_mockModule('../../../logger.js', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils.js', () => ({
  createUIResource: jest.fn(() => ({})),
  createScreenshotViewerUI: jest.fn(() => ''),
  addUIResourceToResponse: jest.fn((response) => response),
}));

const { executeScreenshot } =
  await import('../../../tools/interactions/screenshot.js');

function textFromResult(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): string | undefined {
  const block = result.content[0];
  return block && 'text' in block ? block.text : undefined;
}

describe('executeScreenshot resolveDriver', () => {
  beforeEach(() => {
    mockGetDriver.mockReset();
    mockSetSession.mockReset();
    mockReadAllPersistedSessions.mockReset();
    mockReadAllPersistedSessions.mockResolvedValue([]);
    mockRemovePersistedSession.mockReset();
    mockAttachToRemoteSession.mockReset();
    mockGetScreenshot.mockReset();
    mockGetScreenshot.mockResolvedValue('dGVzdA==');
  });

  test('takes a screenshot when an in-memory driver is available', async () => {
    mockGetDriver.mockReturnValue({} as any);

    const result = await executeScreenshot({
      returnRawBase64: true,
      sessionId: 's1',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
    });
    expect(mockGetScreenshot).toHaveBeenCalledTimes(1);
  });

  test('returns no-active-session error when nothing is available to rehydrate', async () => {
    mockGetDriver.mockReturnValue(null);

    const result = await executeScreenshot({
      returnRawBase64: true,
      sessionId: 'missing',
    });

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toMatch(/No active driver session/i);
    expect(mockGetScreenshot).not.toHaveBeenCalled();
  });

  test('rehydrates a persisted attached session before taking a screenshot', async () => {
    const remoteClient = {
      getTimeouts: jest.fn(async () => ({})),
    };
    mockGetDriver
      .mockReturnValueOnce(null) // first resolveDriver miss
      .mockReturnValueOnce({} as any); // after setSession
    mockReadAllPersistedSessions.mockResolvedValue([
      {
        sessionId: 'persisted-1',
        remoteServerUrl: 'http://remote:4723',
        ownership: 'attached',
        platform: 'Android',
        automationName: 'UiAutomator2',
        deviceName: 'emulator-5554',
        capabilities: { platformName: 'Android' },
      },
    ] as any);
    mockAttachToRemoteSession.mockResolvedValue(remoteClient);

    const result = await executeScreenshot({
      returnRawBase64: true,
      sessionId: 'persisted-1',
    });

    expect(result.isError).toBeFalsy();
    expect(mockAttachToRemoteSession).toHaveBeenCalledWith({
      remoteServerUrl: 'http://remote:4723',
      sessionId: 'persisted-1',
      capabilities: { platformName: 'Android' },
    });
    expect(mockSetSession).toHaveBeenCalled();
    expect(mockGetScreenshot).toHaveBeenCalledTimes(1);
  });
});
