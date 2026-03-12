import { describe, test, expect, jest, afterEach } from '@jest/globals';

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
  setSession,
  setSessionGroup,
  listSessionGroups,
  setActiveSessionGroup,
  getActiveSessionGroupId,
  resolveSessionTarget,
  safeDeleteSession,
  safeDeleteAllSessions,
} = await import('../session-store.js');

const { executeAcrossSessions } = await import('../broadcast.js');

function makeMockDriver(deleteSessionImpl?: () => Promise<void>) {
  return { deleteSession: deleteSessionImpl ?? (async () => {}) } as any;
}

afterEach(async () => {
  await safeDeleteAllSessions();
});

describe('session groups', () => {
  test('creates a session group from existing session ids', () => {
    setSession(makeMockDriver(), 'session-1');
    setSession(makeMockDriver(), 'session-2');

    const group = setSessionGroup('smoke', ['session-1', 'session-2']);

    expect(group.groupId).toBe('smoke');
    expect(group.sessionIds).toEqual(['session-1', 'session-2']);
    expect(listSessionGroups()).toHaveLength(1);
  });

  test('throws when a group has no valid session ids', () => {
    expect(() => setSessionGroup('empty', ['missing-session'])).toThrow(
      'Cannot create a session group without at least one valid session ID.'
    );
  });

  test('marks a selected group as active', () => {
    setSession(makeMockDriver(), 'session-1');
    setSessionGroup('smoke', ['session-1']);

    expect(setActiveSessionGroup('smoke')).toBe(true);
    expect(getActiveSessionGroupId()).toBe('smoke');
    expect(listSessionGroups()[0].isActive).toBe(true);
  });

  test('removes deleted sessions from groups and deletes empty groups', async () => {
    setSession(makeMockDriver(), 'session-1');
    setSessionGroup('smoke', ['session-1']);

    await safeDeleteSession('session-1');

    expect(listSessionGroups()).toEqual([]);
  });

  test('resolves all sessions for a group target', () => {
    setSession(makeMockDriver(), 'session-1');
    setSession(makeMockDriver(), 'session-2');
    setSessionGroup('smoke', ['session-1', 'session-2']);

    const sessions = resolveSessionTarget({ kind: 'group', groupId: 'smoke' });

    expect(sessions.map((session) => session.sessionId)).toEqual([
      'session-1',
      'session-2',
    ]);
  });
});

describe('executeAcrossSessions', () => {
  test('executes an operation across all sessions', async () => {
    setSession(makeMockDriver(), 'session-1', {
      platformName: 'Android',
      'appium:deviceName': 'Pixel 8',
    });
    setSession(makeMockDriver(), 'session-2', {
      platformName: 'iOS',
      'appium:deviceName': 'iPhone 15',
    });

    const result = await executeAcrossSessions(
      { kind: 'all' },
      async (session) => `ok:${session.sessionId}`
    );

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results.map((item) => item.value)).toEqual([
      'ok:session-1',
      'ok:session-2',
    ]);
  });

  test('captures per-session failures without failing the whole broadcast', async () => {
    setSession(makeMockDriver(), 'session-1');
    setSession(makeMockDriver(), 'session-2');

    const result = await executeAcrossSessions(
      { kind: 'all' },
      async (session) => {
        if (session.sessionId === 'session-2') {
          throw new Error('boom');
        }
        return 'ok';
      }
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[1].status).toBe('error');
    expect(result.results[1].error).toBe('boom');
  });
});
