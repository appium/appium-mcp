import { beforeEach, describe, test, expect, jest } from '@jest/globals';

// ── module mocks ──────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../../tools/session/select-device', () => ({
  getSelectedDevice: () => 'device-udid',
  getSelectedDeviceType: () => 'simulator',
  getSelectedDeviceInfo: () => ({ name: 'iPhone 12', platform: '16.0' }),
  clearSelectedDevice: () => {},
}));

jest.unstable_mockModule('../../../devicemanager/ios-manager', () => ({
  IOSManager: {
    getInstance: () => ({
      getDevicesByType: async (_t: any) => [{ udid: 'u1' }],
    }),
  },
}));

jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

jest.unstable_mockModule('appium-uiautomator2-driver', () => ({
  AndroidUiautomator2Driver: class {},
}));
jest.unstable_mockModule('appium-xcuitest-driver', () => ({
  XCUITestDriver: class {},
}));
jest.unstable_mockModule('webdriver', () => ({
  default: {
    newSession: async () => ({ sessionId: 'remote-session-id' }),
    attachToSession: async () => ({
      sessionId: 'attached-session-id',
      capabilities: { platformName: 'Android' },
    }),
  },
}));

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  getSessionOwnership: jest.fn(),
  getSessionId: jest.fn(),
  listSessions: jest.fn(),
  detachSession: jest.fn(),
  setActiveSession: jest.fn(),
  safeDeleteSession: jest.fn(),
  setSession: jest.fn(),
  getPlatformName: jest.fn(),
  PLATFORM: { ios: 'iOS', android: 'Android' },
}));

jest.unstable_mockModule('../../../ui/mcp-ui-utils', () => ({
  createUIResource: jest.fn(() => ({})),
  createSessionDashboardUI: jest.fn(() => ''),
  addUIResourceToResponse: jest.fn((_result: any, _ui: any) => _result),
}));

// ── imports ───────────────────────────────────────────────────────────────────

const {
  getDriver,
  getSessionOwnership,
  getSessionId,
  listSessions,
  detachSession,
  setActiveSession,
  safeDeleteSession,
  setSession,
} = await import('../../../session-store.js');

const mockGetDriver = getDriver as jest.MockedFunction<typeof getDriver>;
const mockGetSessionOwnership = getSessionOwnership as jest.MockedFunction<typeof getSessionOwnership>;
const mockGetSessionId = getSessionId as jest.MockedFunction<typeof getSessionId>;
const mockListSessions = listSessions as jest.MockedFunction<typeof listSessions>;
const mockDetachSession = detachSession as jest.MockedFunction<typeof detachSession>;
const mockSetActiveSession = setActiveSession as jest.MockedFunction<typeof setActiveSession>;
const mockSafeDeleteSession = safeDeleteSession as jest.MockedFunction<typeof safeDeleteSession>;
const mockSetSession = setSession as jest.MockedFunction<typeof setSession>;

const {
  buildAndroidCapabilities,
  buildIOSCapabilities,
  getPortFromUrl,
  validateRemoteServerUrl,
} = await import('../../../tools/session/create-session.js');

// ── tool helper ───────────────────────────────────────────────────────────────

const mockServer = { addTool: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

async function getToolExecute() {
  const { default: session } = await import('../../../tools/session/session.js');
  session(mockServer);
  return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(-1)?.[0];
}

// ── appium_session_management tool tests ─────────────────────────────────────────────────

describe('appium_session_management tool', () => {
  describe('action: list', () => {
    test('returns "no sessions" when none exist', async () => {
      const tool = await getToolExecute();
      mockListSessions.mockReturnValue([]);

      const result = await tool.execute({ action: 'list' }, undefined);
      expect(result.content[0].text).toBe('No active sessions found.');
    });

    test('returns session summary when sessions exist', async () => {
      const tool = await getToolExecute();
      mockListSessions.mockReturnValue([
        {
          sessionId: 'abc123',
          isActive: true,
          ownership: 'owned',
          platform: 'Android',
          automationName: 'UiAutomator2',
          deviceName: 'Pixel 6',
          currentContext: 'NATIVE_APP',
        },
      ] as any);
      mockGetSessionId.mockReturnValue('abc123');
      mockGetDriver.mockReturnValue({
        constructor: { name: 'AndroidDriver' },
      } as any);

      const result = await tool.execute({ action: 'list' }, undefined);
      expect(result.content[0].text).toContain('abc123');
      expect(result.content[0].text).toContain('active');
      expect(result.content[0].text).toContain('ownership=owned');
    });
  });

  describe('action: select', () => {
    test('returns error when sessionId is missing', async () => {
      const tool = await getToolExecute();
      const result = await tool.execute({ action: 'select' }, undefined);
      expect(result.content[0].text).toBe(
        'sessionId is required for select action'
      );
    });

    test('returns error when session is not found', async () => {
      const tool = await getToolExecute();
      mockSetActiveSession.mockReturnValue(false);

      const result = await tool.execute(
        { action: 'select', sessionId: 'bad-id' },
        undefined
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('bad-id');
      expect(result.content[0].text).toContain('not found');
    });

    test('returns success when session is activated', async () => {
      const tool = await getToolExecute();
      mockSetActiveSession.mockReturnValue(true);

      const result = await tool.execute(
        { action: 'select', sessionId: 'abc123' },
        undefined
      );
      expect(result.content[0].text).toContain('abc123');
      expect(result.content[0].text).toContain('now active');
    });
  });

  describe('action: delete', () => {
    test('deletes active session when no sessionId given', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('owned');
      mockSafeDeleteSession.mockResolvedValue(true as any);

      const result = await tool.execute({ action: 'delete' }, undefined);
      expect(result.content[0].text).toContain('deleted successfully');
    });

    test('rejects deleting an attached session', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('attached');

      const result = await tool.execute(
        { action: 'delete', sessionId: 'borrowed' },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('action=detach');
      expect(mockSafeDeleteSession).not.toHaveBeenCalled();
    });

    test('reports not found when session does not exist', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('owned');
      mockSafeDeleteSession.mockResolvedValue(false as any);

      const result = await tool.execute(
        { action: 'delete', sessionId: 'ghost' },
        undefined
      );
      expect(result.content[0].text).toContain('ghost');
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('action: attach', () => {
    test('returns error when remoteServerUrl is missing', async () => {
      const tool = await getToolExecute();

      const result = await tool.execute(
        { action: 'attach', sessionId: 'borrowed' },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'remoteServerUrl is required for attach action'
      );
    });

    test('returns error when sessionId is missing', async () => {
      const tool = await getToolExecute();

      const result = await tool.execute(
        { action: 'attach', remoteServerUrl: 'http://localhost:4723' },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'sessionId is required for attach action'
      );
    });

    test('attaches an existing remote session as attached ownership', async () => {
      const tool = await getToolExecute();
      mockListSessions.mockReturnValue([
        { sessionId: 'borrowed', isActive: true, ownership: 'attached' },
      ] as any);

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
        },
        undefined
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Attached to existing session');
      expect(mockSetSession).toHaveBeenCalledWith(
        expect.anything(),
        'borrowed',
        { platformName: 'Android' },
        'attached'
      );
    });
  });

  describe('action: detach', () => {
    test('rejects detaching an owned session', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('owned');

      const result = await tool.execute(
        { action: 'detach', sessionId: 'owned-session' },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('action=delete');
      expect(mockDetachSession).not.toHaveBeenCalled();
    });

    test('detaches an attached session', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('attached');
      mockDetachSession.mockReturnValue(true);

      const result = await tool.execute(
        { action: 'detach', sessionId: 'borrowed' },
        undefined
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('detached successfully');
      expect(mockDetachSession).toHaveBeenCalledWith('borrowed');
    });
  });

  describe('action: create', () => {
    test('returns error when platform is missing', async () => {
      const tool = await getToolExecute();
      const result = await tool.execute({ action: 'create' }, undefined);
      expect(result.content[0].text).toBe(
        'platform is required for create action'
      );
    });
  });
});

// ── capability builder tests ──────────────────────────────────────────────────

describe('buildAndroidCapabilities', () => {
  test('includes udid for local server and removes empty values', () => {
    const caps = buildAndroidCapabilities(
      { 'appium:app': '/path/app.apk' },
      { 'appium:deviceName': '' },
      false
    );
    expect(caps.platformName).toBe('Android');
    expect(caps['appium:app']).toBe('/path/app.apk');
    expect(caps['appium:udid']).toBe('device-udid');
    expect(caps).not.toHaveProperty('appium:deviceName');
    expect(caps['appium:settings[actionAcknowledgmentTimeout]']).toBe(0);
    expect(caps['appium:settings[waitForIdleTimeout]']).toBe(0);
    expect(caps['appium:settings[waitForSelectorTimeout]']).toBe(0);
  });

  test('does not include udid for remote server', () => {
    const caps = buildAndroidCapabilities({}, undefined, true);
    expect(caps.platformName).toBe('Android');
    expect(caps).not.toHaveProperty('appium:udid');
  });
});

describe('buildIOSCapabilities', () => {
  test('uses selected device info for local simulator', async () => {
    const caps = await buildIOSCapabilities(
      { 'custom:cap': 'value' },
      { 'appium:bundleId': 'com.example.app' },
      false
    );
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:deviceName']).toBe('iPhone 12');
    expect(caps['appium:platformVersion']).toBe('16.0');
    expect(caps['appium:usePrebuiltWDA']).toBe(true);
    expect(caps['appium:wdaStartupRetries']).toBe(4);
    expect(caps['custom:cap']).toBe('value');
    expect(caps['appium:bundleId']).toBe('com.example.app');
  });

  test('falls back to defaults for remote server', async () => {
    const caps = await buildIOSCapabilities({}, undefined, true);
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:deviceName']).toBe('iPhone Simulator');
    expect(caps).not.toHaveProperty('appium:udid');
  });
});

// ── URL helpers ───────────────────────────────────────────────────────────────

describe('getPortFromUrl', () => {
  test.each([
    ['https://hub.browserstack.com/wd/hub', 443],
    ['http://localhost/wd/hub', 80],
    ['http://localhost:4723/wd/hub', 4723],
    ['https://example.com:8443/path', 8443],
  ])('%s → %i', (url, expected) => {
    expect(getPortFromUrl(new URL(url))).toBe(expected);
  });
});

describe('validateRemoteServerUrl', () => {
  test.each(['http://localhost:4723', 'https://example.com'])(
    'accepts valid URL: %s',
    (url) => expect(() => validateRemoteServerUrl(url)).not.toThrow()
  );

  test.each(['invalid-url', 'ftp://example.com'])(
    'rejects invalid URL: %s',
    (url) =>
      expect(() => validateRemoteServerUrl(url)).toThrow(
        `Invalid remoteServerUrl: ${url}.`
      )
  );

  test('accepts URL matching custom regex', () => {
    expect(() =>
      validateRemoteServerUrl(
        'ftp://localhost:4723',
        '^.+//localhost:4723(/.*)?$'
      )
    ).not.toThrow();
  });

  test('rejects URL not matching custom regex', () => {
    expect(() =>
      validateRemoteServerUrl(
        'http://localhost:5000',
        '^https?://localhost:4723(/.*)?$'
      )
    ).toThrow('Invalid remoteServerUrl: http://localhost:5000.');
  });
});
