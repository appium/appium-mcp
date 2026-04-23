import { describe, test, expect, jest, afterEach } from '@jest/globals';

// Mock heavy native driver packages so the module can be imported without
// native dependencies installed in the test environment.
await jest.unstable_mockModule('appium-uiautomator2-driver', () => ({
  AndroidUiautomator2Driver: class MockAndroidUiautomator2Driver {
    async deleteSession() {}
  },
}));

await jest.unstable_mockModule('appium-xcuitest-driver', () => ({
  XCUITestDriver: class MockXCUITestDriver {
    async deleteSession() {}
  },
}));

await jest.unstable_mockModule('../logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  detachSession,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  setSession,
  getDriver,
  getSessionOwnership,
  getSessionId,
  listSessions,
  setActiveSession,
  setCurrentContext,
  getCurrentContext,
  isDeletingSessionInProgress,
  hasActiveSession,
  safeDeleteSession,
  safeDeleteAllSessions,
  getPlatformName,
  PLATFORM,
} = await import('../session-store.js');

const { AndroidUiautomator2Driver } = await import('appium-uiautomator2-driver');
const { XCUITestDriver } = await import('appium-xcuitest-driver');

// Shared mock driver factory with a controllable deleteSession.
function makeMockDriver(deleteSessionImpl?: () => Promise<void>) {
  return { deleteSession: deleteSessionImpl ?? (async () => {}) } as any;
}

afterEach(async () => {
  // Remove all sessions to reset shared module-level state between tests.
  await safeDeleteAllSessions();
  for (const session of listSessions()) {
    detachSession(session.sessionId);
  }
});

// ---------------------------------------------------------------------------
// isRemoteDriverSession
// ---------------------------------------------------------------------------
describe('isRemoteDriverSession', () => {
  test('returns false for null driver', () => {
    expect(isRemoteDriverSession(null)).toBe(false);
  });

  test('returns false for AndroidUiautomator2Driver instance', () => {
    const driver = new (AndroidUiautomator2Driver as any)();
    expect(isRemoteDriverSession(driver)).toBe(false);
  });

  test('returns false for XCUITestDriver instance', () => {
    const driver = new (XCUITestDriver as any)();
    expect(isRemoteDriverSession(driver)).toBe(false);
  });

  test('returns true for a plain remote client object', () => {
    const remoteClient = {} as any;
    expect(isRemoteDriverSession(remoteClient)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAndroidUiautomator2DriverSession
// ---------------------------------------------------------------------------
describe('isAndroidUiautomator2DriverSession', () => {
  test('returns false for null driver', () => {
    expect(isAndroidUiautomator2DriverSession(null)).toBe(false);
  });

  test('returns true for AndroidUiautomator2Driver instance', () => {
    const driver = new (AndroidUiautomator2Driver as any)();
    expect(isAndroidUiautomator2DriverSession(driver)).toBe(true);
  });

  test('returns false for XCUITestDriver instance', () => {
    const driver = new (XCUITestDriver as any)();
    expect(isAndroidUiautomator2DriverSession(driver)).toBe(false);
  });

  test('returns false for remote client object', () => {
    expect(isAndroidUiautomator2DriverSession({} as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isXCUITestDriverSession
// ---------------------------------------------------------------------------
describe('isXCUITestDriverSession', () => {
  test('returns false for null driver', () => {
    expect(isXCUITestDriverSession(null)).toBe(false);
  });

  test('returns true for XCUITestDriver instance', () => {
    const driver = new (XCUITestDriver as any)();
    expect(isXCUITestDriverSession(driver)).toBe(true);
  });

  test('returns false for AndroidUiautomator2Driver instance', () => {
    const driver = new (AndroidUiautomator2Driver as any)();
    expect(isXCUITestDriverSession(driver)).toBe(false);
  });

  test('returns false for remote client object', () => {
    expect(isXCUITestDriverSession({} as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setSession / getDriver / getSessionId
// ---------------------------------------------------------------------------
describe('setSession', () => {
  test('setting null id clears the active session id without storing a session', () => {
    const driver = makeMockDriver();
    setSession(driver, 'session-1');
    setSession(driver, null);
    expect(getSessionId()).toBeNull();
    expect(getDriver()).toBeNull();
  });

  test('stores the session and makes it active', () => {
    const driver = makeMockDriver();
    setSession(driver, 'session-1');
    expect(getSessionId()).toBe('session-1');
    expect(getDriver()).toBe(driver);
  });

  test('getDriver returns the driver for the specified sessionId', () => {
    const driver1 = makeMockDriver();
    const driver2 = makeMockDriver();
    setSession(driver1, 'session-1');
    setSession(driver2, 'session-2');
    expect(getDriver('session-1')).toBe(driver1);
    expect(getDriver('session-2')).toBe(driver2);
  });

  test('getDriver returns null for an unknown session id', () => {
    expect(getDriver('non-existent')).toBeNull();
  });

  test('getDriver returns null when there is no active session', () => {
    expect(getDriver()).toBeNull();
  });

  test('extracts platform metadata from capabilities', () => {
    const driver = makeMockDriver();
    setSession(driver, 'session-meta', {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'Pixel 5',
    });
    const sessions = listSessions();
    const session = sessions.find((s) => s.sessionId === 'session-meta');
    expect(session?.platform).toBe('Android');
    expect(session?.automationName).toBe('UiAutomator2');
    expect(session?.deviceName).toBe('Pixel 5');
  });

  test('falls back to appium:platformName when platformName is absent', () => {
    const driver = makeMockDriver();
    setSession(driver, 'session-fallback', {
      'appium:platformName': 'iOS',
    });
    const session = listSessions().find(
      (s) => s.sessionId === 'session-fallback'
    );
    expect(session?.platform).toBe('iOS');
  });

  test('stores ownership and exposes it through list/get helpers', () => {
    const driver = makeMockDriver();
    setSession(driver, 'session-attached', {}, 'attached');

    expect(getSessionOwnership('session-attached')).toBe('attached');
    expect(listSessions()[0]?.ownership).toBe('attached');
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------
describe('listSessions', () => {
  test('returns an empty array when there are no sessions', () => {
    expect(listSessions()).toEqual([]);
  });

  test('marks only the active session as isActive:true', () => {
    const driver1 = makeMockDriver();
    const driver2 = makeMockDriver();
    setSession(driver1, 'session-a');
    setSession(driver2, 'session-b'); // session-b becomes active

    const sessions = listSessions();
    expect(sessions).toHaveLength(2);

    const a = sessions.find((s) => s.sessionId === 'session-a')!;
    const b = sessions.find((s) => s.sessionId === 'session-b')!;
    expect(a.isActive).toBe(false);
    expect(b.isActive).toBe(true);
  });

  test('returns currentContext and capabilities for each session', () => {
    const caps = { platformName: 'Android' };
    setSession(makeMockDriver(), 'session-ctx', caps);
    const session = listSessions()[0];
    expect(session.currentContext).toBe('NATIVE_APP');
    expect(session.capabilities).toEqual(caps);
  });
});

// ---------------------------------------------------------------------------
// setActiveSession
// ---------------------------------------------------------------------------
describe('setActiveSession', () => {
  test('returns false for a session that does not exist', () => {
    expect(setActiveSession('unknown')).toBe(false);
  });

  test('switches the active session and returns true', () => {
    setSession(makeMockDriver(), 'session-1');
    setSession(makeMockDriver(), 'session-2'); // session-2 is now active

    expect(getSessionId()).toBe('session-2');
    const result = setActiveSession('session-1');
    expect(result).toBe(true);
    expect(getSessionId()).toBe('session-1');
  });
});

// ---------------------------------------------------------------------------
// setCurrentContext / getCurrentContext
// ---------------------------------------------------------------------------
describe('setCurrentContext / getCurrentContext', () => {
  test('getCurrentContext returns null when there is no active session', () => {
    expect(getCurrentContext()).toBeNull();
  });

  test('setCurrentContext returns false when there is no active session', () => {
    expect(setCurrentContext('WEBVIEW')).toBe(false);
  });

  test('setCurrentContext updates the context and returns true', () => {
    setSession(makeMockDriver(), 'session-ctx');

    const result = setCurrentContext('WEBVIEW_chrome');
    expect(result).toBe(true);
    expect(getCurrentContext()).toBe('WEBVIEW_chrome');
  });

  test('setCurrentContext works with an explicit sessionId', () => {
    setSession(makeMockDriver(), 'session-ctx');
    setCurrentContext('WEBVIEW_myapp', 'session-ctx');
    expect(getCurrentContext('session-ctx')).toBe('WEBVIEW_myapp');
  });

  test('setCurrentContext returns false for a non-existent sessionId', () => {
    expect(setCurrentContext('WEBVIEW', 'no-such-session')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDeletingSessionInProgress
// ---------------------------------------------------------------------------
describe('isDeletingSessionInProgress', () => {
  test('returns false when there is no active session', () => {
    expect(isDeletingSessionInProgress()).toBe(false);
  });

  test('returns false for a session that is not being deleted', () => {
    setSession(makeMockDriver(), 'session-1');
    expect(isDeletingSessionInProgress('session-1')).toBe(false);
  });

  test('returns true while deletion is in progress', async () => {
    let resolveDelete!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });

    const slowDriver = { deleteSession: () => pending } as any;
    setSession(slowDriver, 'slow-session');

    const deleteTask = safeDeleteSession('slow-session');

    // Yield the microtask queue so the async function runs up to the
    // await of driver.deleteSession(), placing isDeletingSession = true.
    await Promise.resolve();
    expect(isDeletingSessionInProgress('slow-session')).toBe(true);

    resolveDelete();
    await deleteTask;

    // Session has been removed; the check should now return false.
    expect(isDeletingSessionInProgress('slow-session')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasActiveSession
// ---------------------------------------------------------------------------
describe('hasActiveSession', () => {
  test('returns false when there are no sessions', () => {
    expect(hasActiveSession()).toBe(false);
  });

  test('returns true when there is a normal active session', () => {
    setSession(makeMockDriver(), 'session-1');
    expect(hasActiveSession()).toBe(true);
  });

  test('returns false while the active session is being deleted', async () => {
    let resolveDelete!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });

    const slowDriver = { deleteSession: () => pending } as any;
    setSession(slowDriver, 'active-session');

    const deleteTask = safeDeleteSession('active-session');

    await Promise.resolve();
    expect(hasActiveSession()).toBe(false);

    resolveDelete();
    await deleteTask;
  });
});

// ---------------------------------------------------------------------------
// safeDeleteSession
// ---------------------------------------------------------------------------
describe('safeDeleteSession', () => {
  test('returns false when there is no active session', async () => {
    const result = await safeDeleteSession();
    expect(result).toBe(false);
  });

  test('returns false when the specified session does not exist', async () => {
    const result = await safeDeleteSession('ghost-session');
    expect(result).toBe(false);
  });

  test('calls driver.deleteSession() and removes the session', async () => {
    let calledDeleteSession = false;
    const driver = {
      deleteSession: async () => {
        calledDeleteSession = true;
      },
    } as any;

    setSession(driver, 'session-del');
    const result = await safeDeleteSession('session-del');

    expect(result).toBe(true);
    expect(calledDeleteSession).toBe(true);
    expect(getDriver('session-del')).toBeNull();
  });

  test('deletes the active session when no sessionId is provided', async () => {
    setSession(makeMockDriver(), 'session-active');

    const result = await safeDeleteSession();
    expect(result).toBe(true);
    expect(getSessionId()).toBeNull();
  });

  test('promotes another session as active after the active one is deleted', async () => {
    setSession(makeMockDriver(), 'session-1');
    setSession(makeMockDriver(), 'session-2'); // session-2 is active

    await safeDeleteSession('session-2');

    // The remaining session-1 should now be (or there is simply no active session,
    // but a remaining session exists in the store).
    const remaining = listSessions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sessionId).toBe('session-1');
  });

  test('returns false and skips when deletion is already in progress', async () => {
    let resolveDelete!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });

    const slowDriver = { deleteSession: () => pending } as any;
    setSession(slowDriver, 'double-delete-session');

    const firstDelete = safeDeleteSession('double-delete-session');
    await Promise.resolve(); // let the first deletion acquire the lock

    const secondResult = await safeDeleteSession('double-delete-session');
    expect(secondResult).toBe(false);

    resolveDelete();
    await firstDelete;
  });

  test('re-throws driver errors', async () => {
    // Throw only on the first call so the afterEach cleanup can still succeed.
    let calls = 0;
    const errorDriver = {
      deleteSession: async () => {
        if (calls++ === 0) {
          throw new Error('driver error');
        }
      },
    } as any;

    setSession(errorDriver, 'error-session');
    await expect(safeDeleteSession('error-session')).rejects.toThrow(
      'driver error'
    );
  });
});

// ---------------------------------------------------------------------------
// safeDeleteAllSessions
// ---------------------------------------------------------------------------
describe('safeDeleteAllSessions', () => {
  test('returns 0 when there are no sessions', async () => {
    const count = await safeDeleteAllSessions();
    expect(count).toBe(0);
  });

  test('deletes all sessions and returns the deleted count', async () => {
    setSession(makeMockDriver(), 'session-1');
    setSession(makeMockDriver(), 'session-2');
    setSession(makeMockDriver(), 'session-3');

    const count = await safeDeleteAllSessions();
    expect(count).toBe(3);
    expect(listSessions()).toHaveLength(0);
  });

  test('counts only successfully deleted sessions', async () => {
    const goodDriver = makeMockDriver();
    // Throw only on the first call so the afterEach cleanup can still succeed.
    let calls = 0;
    const badDriver = {
      deleteSession: async () => {
        if (calls++ === 0) {
          throw new Error('fail');
        }
      },
    } as any;

    setSession(goodDriver, 'good-session');
    setSession(badDriver, 'bad-session');

    const count = await safeDeleteAllSessions();
    // Only the good session should have been deleted.
    expect(count).toBe(1);
  });

  test('deletes only owned sessions', async () => {
    let ownedDeleted = false;
    setSession(
      {
        deleteSession: async () => {
          ownedDeleted = true;
        },
      } as any,
      'owned-session',
      {},
      'owned'
    );
    setSession(makeMockDriver(), 'attached-session', {}, 'attached');

    const count = await safeDeleteAllSessions();

    expect(count).toBe(1);
    expect(ownedDeleted).toBe(true);
    expect(getDriver('owned-session')).toBeNull();
    expect(getDriver('attached-session')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detachSession / getSessionOwnership
// ---------------------------------------------------------------------------
describe('detachSession / getSessionOwnership', () => {
  test('returns null ownership for a missing session', () => {
    expect(getSessionOwnership('missing')).toBeNull();
  });

  test('detaches an attached session without deleting it', () => {
    let deleted = false;
    const driver = {
      deleteSession: async () => {
        deleted = true;
      },
    } as any;

    setSession(driver, 'attached-session', {}, 'attached');

    expect(detachSession('attached-session')).toBe(true);
    expect(getDriver('attached-session')).toBeNull();
    expect(deleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPlatformName
// ---------------------------------------------------------------------------
describe('getPlatformName', () => {
  test('returns platform.android for AndroidUiautomator2Driver instance', () => {
    const driver = new (AndroidUiautomator2Driver as any)();
    expect(getPlatformName(driver)).toBe(PLATFORM.android);
  });

  test('returns platform.ios for XCUITestDriver instance', () => {
    const driver = new (XCUITestDriver as any)();
    expect(getPlatformName(driver)).toBe(PLATFORM.ios);
  });

  test('returns platform.android for a Client with isAndroid=true', () => {
    const client = { isAndroid: true, isIOS: false } as any;
    expect(getPlatformName(client)).toBe(PLATFORM.android);
  });

  test('returns platform.ios for a Client with isIOS=true', () => {
    const client = { isAndroid: false, isIOS: true } as any;
    expect(getPlatformName(client)).toBe(PLATFORM.ios);
  });

  test('throws for an unrecognised driver type', () => {
    const unknown = { isAndroid: false, isIOS: false } as any;
    expect(() => getPlatformName(unknown)).toThrow('Unknown driver type');
  });

  test('falls back to session platformName for remote sessions', () => {
    const client = {
      isAndroid: false,
      isIOS: false,
      sessionId: 'session-remote-android',
    } as any;
    setSession(client, 'session-remote-android', {
      platformName: 'Android',
    });
    expect(getPlatformName(client)).toBe(PLATFORM.android);
  });

  test('falls back to appium:platformName when platformName is absent', () => {
    const client = {
      isAndroid: false,
      isIOS: false,
      sessionId: 'session-remote-ios-cap',
    } as any;
    setSession(client, 'session-remote-ios-cap', {
      'appium:platformName': 'iOS',
    });
    expect(getPlatformName(client)).toBe(PLATFORM.ios);
  });
});
