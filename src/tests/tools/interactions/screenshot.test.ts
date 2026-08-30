import {describe, test, expect, jest, beforeEach} from '@jest/globals';

const mockGetDriver = jest.fn((_sessionId?: string): any => null);
const mockSetSession = jest.fn(async () => {});
const mockReadAllPersistedSessions = jest.fn(async (): Promise<any[]> => []);
const mockRemovePersistedSession = jest.fn(async () => {});
const mockAttachToRemoteSession = jest.fn(async (_opts: any): Promise<any> => ({}));
const mockGetScreenshot = jest.fn(async () => 'dGVzdA=='); // "test" base64
const mockClientSupportsMcpApps = jest.fn(() => false);
const mockIsMcpAppsEnabled = jest.fn(() => true);
const mockCreateUIResource = jest.fn(() => ({}));
const mockCreateScreenshotViewerUI = jest.fn((_base64: string, _filepath: string) => '');
const mockAddUIResourceToResponse = jest.fn((response: any, factory: () => unknown) => ({
  content: [...response.content, factory()],
}));

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
  default: {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}},
}));

jest.unstable_mockModule('../../../ui/mcp-apps.js', () => ({
  MCP_APP_MIME_TYPE: 'text/html;profile=mcp-app',
  clientSupportsMcpApps: mockClientSupportsMcpApps,
  isMcpAppsEnabled: mockIsMcpAppsEnabled,
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils.js', () => ({
  createUIResource: mockCreateUIResource,
  createScreenshotViewerUI: mockCreateScreenshotViewerUI,
  addUIResourceToResponse: mockAddUIResourceToResponse,
}));

const {executeScreenshot, default: registerScreenshot} = await import('../../../tools/interactions/screenshot.js');

function textFromResult(result: {
  content: Array<{type: string; text?: string}>;
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
    mockClientSupportsMcpApps.mockReset();
    mockClientSupportsMcpApps.mockReturnValue(false);
    mockIsMcpAppsEnabled.mockReset();
    mockIsMcpAppsEnabled.mockReturnValue(true);
    mockCreateUIResource.mockClear();
    mockCreateScreenshotViewerUI.mockClear();
    mockAddUIResourceToResponse.mockClear();
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

  test('keeps saved screenshot base64 out of model content for MCP Apps clients', async () => {
    mockGetDriver.mockReturnValue({} as any);
    const deps = screenshotDeps();

    const result = await executeScreenshot({
      deps,
      useMcpApps: true,
    });

    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Screenshot saved successfully to: /screenshots/screenshot_123.png',
      },
    ]);
    expect(result.structuredContent).toEqual({
      screenshot: {
        data: 'dGVzdA==',
        mimeType: 'image/png',
        filepath: '/screenshots/screenshot_123.png',
      },
    });
    expect(mockAddUIResourceToResponse).not.toHaveBeenCalled();
    expect(mockCreateScreenshotViewerUI).not.toHaveBeenCalled();
  });

  test('keeps the embedded screenshot viewer fallback for other clients', async () => {
    mockGetDriver.mockReturnValue({} as any);

    await executeScreenshot({deps: screenshotDeps()});

    expect(mockAddUIResourceToResponse).toHaveBeenCalledTimes(1);
    expect(mockCreateScreenshotViewerUI).toHaveBeenCalledWith('dGVzdA==', '/screenshots/screenshot_123.png');
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
        capabilities: {platformName: 'Android'},
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
      capabilities: {platformName: 'Android'},
    });
    expect(mockSetSession).toHaveBeenCalled();
    expect(mockGetScreenshot).toHaveBeenCalledTimes(1);
  });
});

describe('appium_screenshot MCP Apps registration', () => {
  beforeEach(() => {
    mockClientSupportsMcpApps.mockReset();
    mockClientSupportsMcpApps.mockReturnValue(false);
    mockIsMcpAppsEnabled.mockReset();
    mockIsMcpAppsEnabled.mockReturnValue(true);
  });

  test('advertises the static viewer when MCP Apps are enabled', () => {
    const tool = registerTool();

    expect(tool._meta).toEqual({
      ui: {resourceUri: 'ui://appium-mcp/screenshot-viewer'},
    });
  });

  test('omits static viewer metadata when MCP Apps are disabled', () => {
    mockIsMcpAppsEnabled.mockReturnValue(false);

    expect(registerTool()._meta).toBeUndefined();
  });
});

function screenshotDeps() {
  return {
    writeFile: jest.fn(async () => {}),
    mkdir: jest.fn(async () => {}),
    resolveScreenshotDir: () => '/screenshots',
    dateNow: () => 123,
  };
}

function registerTool(): {
  execute: (args: Record<string, unknown>, context?: Record<string, unknown>) => Promise<any>;
  _meta?: unknown;
} {
  let definition: any;
  registerScreenshot({
    addTool(tool: any) {
      definition = tool;
    },
    sessions: [],
  } as any);
  return definition;
}
