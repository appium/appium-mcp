import { beforeEach, describe, test, expect, jest } from '@jest/globals';

// ── module mocks ──────────────────────────────────────────────────────────────

const mockAttachToSession = jest.fn<
  (options: Record<string, unknown>) => Promise<any>
>(async (_options: Record<string, unknown>) => ({
  sessionId: 'attached-session-id',
  capabilities: { platformName: 'Android' },
}));

let mockSelectedDevicePlatform: 'android' | 'ios' | null = 'ios';
let mockSelectedDevice: string | null = 'device-udid';

jest.unstable_mockModule('../../../tools/session/select-device', () => ({
  getSelectedLocalDevice: () =>
    mockSelectedDevice
      ? {
          get udid() {
            return mockSelectedDevice;
          },
          get platform() {
            return mockSelectedDevicePlatform;
          },
          get type() {
            return mockSelectedDevicePlatform === 'ios' ? 'simulator' : null;
          },
          get info() {
            return { name: 'iPhone 12', platform: '16.0' };
          },
        }
      : null,
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
    attachToSession: mockAttachToSession,
  },
}));

jest.unstable_mockModule('../../../persistence', () => ({
  isSessionPersistenceEnabled: jest.fn(() => false),
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
  writePersistedSession: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../../../session-store', () => ({
  listPersistedSessions: jest.fn(() => []),
  removePersistedSession: jest.fn(),
  setSession: jest.fn(),
  getDriver: jest.fn(),
  getSessionOwnership: jest.fn(),
  getSessionId: jest.fn(),
  listSessions: jest.fn(),
  detachSession: jest.fn(),
  setActiveSession: jest.fn(),
  safeDeleteSession: jest.fn(),
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
const mockGetSessionOwnership = getSessionOwnership as jest.MockedFunction<
  typeof getSessionOwnership
>;
const mockGetSessionId = getSessionId as jest.MockedFunction<
  typeof getSessionId
>;
const mockListSessions = listSessions as jest.MockedFunction<
  typeof listSessions
>;
const mockDetachSession = detachSession as jest.MockedFunction<
  typeof detachSession
>;
const mockSetActiveSession = setActiveSession as jest.MockedFunction<
  typeof setActiveSession
>;
const mockSafeDeleteSession = safeDeleteSession as jest.MockedFunction<
  typeof safeDeleteSession
>;
const mockSetSession = setSession as jest.MockedFunction<typeof setSession>;

const {
  buildAndroidCapabilities,
  buildIOSCapabilities,
  assignEmbeddedDriverPorts,
  getPortFromUrl,
  validateRemoteServerUrl,
  validateLocalCreatePlatformMatch,
} = await import('../../../tools/session/create-session.js');

const { releaseReservedPorts, reservedPortCount } =
  await import('../../../utils/ports.js');

// ── tool helper ───────────────────────────────────────────────────────────────

const mockServer = { addTool: jest.fn() } as any;

// Default fetch mock: both capability endpoints return nothing (404-like).
// Individual tests override this for the specific responses they need.
let mockFetch: jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectedDevicePlatform = 'ios';
  mockSelectedDevice = 'device-udid';
  mockGetSessionOwnership.mockReturnValue(null);
  mockAttachToSession.mockResolvedValue({
    sessionId: 'attached-session-id',
    capabilities: { platformName: 'Android' },
  });
  mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: false,
  } as Response);
  global.fetch = mockFetch;
});

async function getToolExecute() {
  const { default: session } =
    await import('../../../tools/session/session.js');
  session(mockServer);
  return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
    -1
  )?.[0];
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
      mockGetSessionOwnership.mockReturnValue(null);

      const result = await tool.execute(
        { action: 'delete', sessionId: 'ghost' },
        undefined
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('ghost');
      expect(result.content[0].text).toContain('not found');
      expect(mockSafeDeleteSession).not.toHaveBeenCalled();
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

    test('fetches capabilities from server before creating client and prefers W3C extension endpoint', async () => {
      const tool = await getToolExecute();
      mockListSessions.mockReturnValue([
        { sessionId: 'borrowed', isActive: true, ownership: 'attached' },
      ] as any);
      mockFetch.mockImplementation(async (input) => {
        const url = input.toString();
        if (url.includes('appium/session_capabilities')) {
          return {
            ok: true,
            json: async () => ({
              value: {
                platformName: 'Android',
                automationName: 'UiAutomator2',
              },
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            value: {
              platformName: 'iOS',
              automationName: 'XCUITest',
              deviceName: 'Ignored Device',
            },
          }),
        } as Response;
      });

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
          capabilities: { 'appium:app': 'demo.apk' },
        },
        undefined
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Attached to existing session');
      // Client created with merged caps — W3C extension wins over deprecated and caller
      expect(mockAttachToSession).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: expect.objectContaining({ platformName: 'Android' }),
        })
      );
      expect(mockSetSession).toHaveBeenCalledWith(
        expect.anything(),
        'borrowed',
        {
          platformName: 'Android',
          'appium:automationName': 'UiAutomator2',
          'appium:deviceName': 'Ignored Device',
          'appium:app': 'demo.apk',
        },
        'attached',
        expect.any(String)
      );
    });

    test('falls back to deprecated session endpoint when W3C extension is unavailable', async () => {
      const tool = await getToolExecute();
      mockFetch.mockImplementation(async (input) => {
        const url = input.toString();
        if (url.includes('appium/session_capabilities')) {
          return { ok: false } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            value: { platformName: 'Android', automationName: 'UiAutomator2' },
          }),
        } as Response;
      });

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
          capabilities: {
            deviceName: 'Pixel 9 Pro XL',
            'appium:app': 'demo.apk',
          },
        },
        undefined
      );

      expect(result.isError).toBeFalsy();
      expect(mockSetSession).toHaveBeenCalledWith(
        expect.anything(),
        'borrowed',
        {
          platformName: 'Android',
          'appium:automationName': 'UiAutomator2',
          'appium:deviceName': 'Pixel 9 Pro XL',
          'appium:app': 'demo.apk',
        },
        'attached',
        expect.any(String)
      );
    });

    test('returns error when both capability endpoints are unreachable', async () => {
      const tool = await getToolExecute();
      // mockFetch already returns ok: false for both endpoints by default

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
          capabilities: { platformName: 'Android' },
        },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to fetch capabilities');
      expect(result.content[0].text).toContain('borrowed');
      expect(mockAttachToSession).not.toHaveBeenCalled();
    });

    test('detaches an existing attached session before re-attaching the same id', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('attached');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ value: { platformName: 'Android' } }),
      } as Response);

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
        },
        undefined
      );

      expect(result.isError).toBeFalsy();
      expect(mockDetachSession).toHaveBeenCalledWith('borrowed');
      expect(mockAttachToSession).toHaveBeenCalled();
    });

    test('rejects attaching over an existing owned session', async () => {
      const tool = await getToolExecute();
      mockGetSessionOwnership.mockReturnValue('owned');

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'owned-session',
        },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('action=select');
      expect(mockDetachSession).not.toHaveBeenCalled();
      expect(mockAttachToSession).not.toHaveBeenCalled();
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

    test('returns error when capabilities JSON is invalid', async () => {
      const tool = await getToolExecute();

      const result = await tool.execute(
        {
          action: 'create',
          platform: 'android',
          capabilities: '{not valid json}',
        },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid capabilities JSON');
      expect(mockSetSession).not.toHaveBeenCalled();
    });
  });

  describe('capabilities parsing', () => {
    test('parses valid capabilities JSON string for attach', async () => {
      const tool = await getToolExecute();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ value: { platformName: 'Android' } }),
      } as Response);

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
          capabilities: '{"platformName":"Android","appium:app":"demo.apk"}',
        },
        undefined
      );

      expect(result.isError).toBeFalsy();
      expect(mockSetSession).toHaveBeenCalledWith(
        expect.anything(),
        'borrowed',
        expect.objectContaining({
          platformName: 'Android',
          'appium:app': 'demo.apk',
        }),
        'attached',
        expect.any(String)
      );
    });

    test('returns error on invalid JSON for attach before contacting server', async () => {
      const tool = await getToolExecute();

      const result = await tool.execute(
        {
          action: 'attach',
          remoteServerUrl: 'http://localhost:4723',
          sessionId: 'borrowed',
          capabilities: '{"platformName":',
        },
        undefined
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid capabilities JSON');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockAttachToSession).not.toHaveBeenCalled();
    });
  });
});

// ── capability builder tests ──────────────────────────────────────────────────

describe('buildAndroidCapabilities', () => {
  test('includes udid for local server and removes empty values', () => {
    mockSelectedDevicePlatform = 'android';

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

  test('does not override explicit appium:udid from capabilities', () => {
    mockSelectedDevicePlatform = 'android';

    const caps = buildAndroidCapabilities(
      {},
      { 'appium:udid': 'explicit-udid' },
      false
    );

    expect(caps['appium:udid']).toBe('explicit-udid');
  });

  test('does not override appium:udid from config capabilities', () => {
    mockSelectedDevicePlatform = 'android';

    const caps = buildAndroidCapabilities(
      { 'appium:udid': 'config-udid' },
      undefined,
      false
    );

    expect(caps['appium:udid']).toBe('config-udid');
  });

  test('ignores selected iOS device for local server', () => {
    mockSelectedDevicePlatform = 'ios';

    const caps = buildAndroidCapabilities({}, undefined, false);

    expect(caps.platformName).toBe('Android');
    expect(caps).not.toHaveProperty('appium:udid');
  });

  test('does not include udid for remote server', () => {
    const caps = buildAndroidCapabilities({}, undefined, true);
    expect(caps.platformName).toBe('Android');
    expect(caps).not.toHaveProperty('appium:udid');
  });
});

describe('buildIOSCapabilities', () => {
  test('uses selected device info for local simulator', async () => {
    mockSelectedDevicePlatform = 'ios';

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

  test('does not override explicit appium:udid from capabilities', async () => {
    mockSelectedDevicePlatform = 'ios';

    const caps = await buildIOSCapabilities(
      {},
      { 'appium:udid': 'explicit-udid' },
      false
    );

    expect(caps['appium:udid']).toBe('explicit-udid');
  });

  test('ignores selected Android device for local server', async () => {
    mockSelectedDevicePlatform = 'android';

    const caps = await buildIOSCapabilities({}, undefined, false);

    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:deviceName']).toBe('iPhone Simulator');
    expect(caps).not.toHaveProperty('appium:udid');
    expect(caps).not.toHaveProperty('appium:platformVersion');
    expect(caps).not.toHaveProperty('appium:usePrebuiltWDA');
  });

  test('falls back to defaults for remote server', async () => {
    const caps = await buildIOSCapabilities({}, undefined, true);
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:deviceName']).toBe('iPhone Simulator');
    expect(caps).not.toHaveProperty('appium:udid');
  });
});

describe('assignEmbeddedDriverPorts', () => {
  const ANDROID_CAPS = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
  };

  test('auto-allocates Android systemPort and mjpegServerPort when unset', async () => {
    const { capabilities, allocatedPorts } = await assignEmbeddedDriverPorts(
      'android',
      { ...ANDROID_CAPS }
    );

    expect(typeof capabilities['appium:systemPort']).toBe('number');
    expect(typeof capabilities['appium:mjpegServerPort']).toBe('number');
    expect(capabilities['appium:systemPort']).not.toBe(
      capabilities['appium:mjpegServerPort']
    );
    // Both reserved ports are reported so the caller can release them.
    expect(allocatedPorts).toEqual([
      capabilities['appium:systemPort'],
      capabilities['appium:mjpegServerPort'],
    ]);
    releaseReservedPorts(allocatedPorts);
  });

  test('auto-allocates iOS wdaLocalPort and mjpegServerPort when unset', async () => {
    const { capabilities, allocatedPorts } = await assignEmbeddedDriverPorts(
      'ios',
      {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
      }
    );

    expect(typeof capabilities['appium:wdaLocalPort']).toBe('number');
    expect(typeof capabilities['appium:mjpegServerPort']).toBe('number');
    expect(capabilities['appium:wdaLocalPort']).not.toBe(
      capabilities['appium:mjpegServerPort']
    );
    releaseReservedPorts(allocatedPorts);
  });

  test('preserves caller-provided ports and only reserves the missing one', async () => {
    const { capabilities, allocatedPorts } = await assignEmbeddedDriverPorts(
      'android',
      { ...ANDROID_CAPS, 'appium:systemPort': 8200 }
    );

    expect(capabilities['appium:systemPort']).toBe(8200);
    expect(typeof capabilities['appium:mjpegServerPort']).toBe('number');
    // Only the auto-filled port is reported as reserved; the caller's is not.
    expect(allocatedPorts).toEqual([capabilities['appium:mjpegServerPort']]);
    releaseReservedPorts(allocatedPorts);
  });

  test('gives distinct ports to concurrent embedded sessions', async () => {
    const [a, b] = await Promise.all([
      assignEmbeddedDriverPorts('android', { ...ANDROID_CAPS }),
      assignEmbeddedDriverPorts('android', { ...ANDROID_CAPS }),
    ]);

    expect(a.capabilities['appium:systemPort']).not.toBe(
      b.capabilities['appium:systemPort']
    );
    expect(a.capabilities['appium:mjpegServerPort']).not.toBe(
      b.capabilities['appium:mjpegServerPort']
    );
    releaseReservedPorts([...a.allocatedPorts, ...b.allocatedPorts]);
  });

  test('releasing the reservation lets the port be handed out again', async () => {
    const before = reservedPortCount();
    const { allocatedPorts } = await assignEmbeddedDriverPorts('android', {
      ...ANDROID_CAPS,
    });
    expect(reservedPortCount()).toBe(before + allocatedPorts.length);

    releaseReservedPorts(allocatedPorts);
    expect(reservedPortCount()).toBe(before);
  });

  test('skips iOS allocation when webDriverAgentUrl points at an external WDA', async () => {
    const before = reservedPortCount();
    const { capabilities, allocatedPorts } = await assignEmbeddedDriverPorts(
      'ios',
      {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:webDriverAgentUrl': 'http://127.0.0.1:8123',
      }
    );

    // No ports reserved, the external WDA at the URL owns its ports.
    expect(allocatedPorts).toEqual([]);
    expect(capabilities['appium:wdaLocalPort']).toBeUndefined();
    expect(capabilities['appium:mjpegServerPort']).toBeUndefined();
    expect(capabilities['appium:webDriverAgentUrl']).toBe(
      'http://127.0.0.1:8123'
    );
    expect(reservedPortCount()).toBe(before);
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

describe('validateLocalCreatePlatformMatch', () => {
  test('returns error when local create platform mismatches select_device', () => {
    mockSelectedDevicePlatform = 'ios';

    const result = validateLocalCreatePlatformMatch('android');

    expect(result).toBeDefined();
    expect(result!.isError).toBe(true);
    const message = (result!.content[0] as { text: string }).text;
    expect(message).toContain('platform=android');
    expect(message).toContain('platform=ios');
  });

  test('returns error for the reverse mismatch (android selected, ios create)', () => {
    mockSelectedDevicePlatform = 'android';

    const result = validateLocalCreatePlatformMatch('ios');

    expect(result).toBeDefined();
    expect(result!.isError).toBe(true);
    const message = (result!.content[0] as { text: string }).text;
    expect(message).toContain('platform=ios');
    expect(message).toContain('platform=android');
  });

  test('allows remote create without matching select_device platform', () => {
    mockSelectedDevicePlatform = 'ios';

    expect(
      validateLocalCreatePlatformMatch('android', 'http://localhost:4723')
    ).toBeUndefined();
  });

  test('allows matching local platform', () => {
    mockSelectedDevicePlatform = 'android';

    expect(validateLocalCreatePlatformMatch('android')).toBeUndefined();
  });

  test('allows local create when select_device was not called', () => {
    mockSelectedDevicePlatform = null;

    expect(validateLocalCreatePlatformMatch('android')).toBeUndefined();
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
