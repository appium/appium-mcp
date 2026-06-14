import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockAttachToRemoteSession = jest.fn<
  (
    options: Record<string, unknown>
  ) => Promise<{ getTimeouts: () => Promise<void> }>
>(async () => ({
  getTimeouts: async () => {},
}));

const mockRemovePersistedSession = jest.fn(async () => {});

jest.unstable_mockModule('../../persistence', () => ({
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: mockRemovePersistedSession,
}));

jest.unstable_mockModule('../../session-store', () => ({
  getDriver: jest.fn(),
  setSession: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../utils/url.js', () => ({
  attachToRemoteSession: mockAttachToRemoteSession,
}));

jest.unstable_mockModule('../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { readAllPersistedSessions } = await import('../../persistence.js');
const { getDriver, setSession } = await import('../../session-store.js');
const { resolveDriver, ambiguousPersistedSessionsMessage } =
  await import('../../tools/tool-response.js');

const mockReadAllPersistedSessions =
  readAllPersistedSessions as jest.MockedFunction<
    typeof readAllPersistedSessions
  >;
const mockGetDriver = getDriver as jest.MockedFunction<typeof getDriver>;
const mockSetSession = setSession as jest.MockedFunction<typeof setSession>;

const persistedEntry = (sessionId: string) => ({
  sessionId,
  remoteServerUrl: 'http://localhost:4723',
  capabilities: { platformName: 'Android' },
  platform: 'Android',
  automationName: 'UiAutomator2',
  deviceName: 'Pixel',
  ownership: 'attached' as const,
});

describe('resolveDriver rehydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDriver.mockReturnValue(null as any);
  });

  test('returns ambiguous error when multiple persisted sessions and no sessionId', async () => {
    mockReadAllPersistedSessions.mockResolvedValue([
      persistedEntry('session-a'),
      persistedEntry('session-b'),
    ]);

    const result = await resolveDriver();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.result.isError).toBe(true);
    expect((result.result.content[0] as { text: string }).text).toBe(
      ambiguousPersistedSessionsMessage(['session-a', 'session-b'])
    );
    expect(mockAttachToRemoteSession).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  test('lists ambiguous sessions sorted and does not prune before erroring', async () => {
    mockReadAllPersistedSessions.mockResolvedValue([
      persistedEntry('session-c'),
      persistedEntry('session-a'),
      persistedEntry('session-b'),
    ]);

    const result = await resolveDriver();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect((result.result.content[0] as { text: string }).text).toBe(
      ambiguousPersistedSessionsMessage(['session-a', 'session-b', 'session-c'])
    );
    // Guard fires before any liveness check, so nothing is pruned.
    expect(mockRemovePersistedSession).not.toHaveBeenCalled();
  });

  test('rehydrates when exactly one persisted session and no sessionId', async () => {
    const mockDriver = { sessionId: 'only-session' };
    mockReadAllPersistedSessions.mockResolvedValue([
      persistedEntry('only-session'),
    ]);
    mockAttachToRemoteSession.mockResolvedValue({
      getTimeouts: async () => {},
    });
    mockGetDriver
      .mockReturnValueOnce(null as any)
      .mockReturnValue(mockDriver as any);

    const result = await resolveDriver();

    expect(result.ok).toBe(true);
    expect(mockAttachToRemoteSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'only-session' })
    );
    expect(mockSetSession).toHaveBeenCalled();
  });

  test('rehydrates a specific sessionId when multiple persisted sessions exist', async () => {
    const mockDriver = { sessionId: 'session-b' };
    mockReadAllPersistedSessions.mockResolvedValue([
      persistedEntry('session-a'),
      persistedEntry('session-b'),
    ]);
    mockAttachToRemoteSession.mockResolvedValue({
      getTimeouts: async () => {},
    });
    mockGetDriver
      .mockReturnValueOnce(null as any)
      .mockReturnValue(mockDriver as any);

    const result = await resolveDriver('session-b');

    expect(result.ok).toBe(true);
    expect(mockAttachToRemoteSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-b' })
    );
    expect(mockAttachToRemoteSession).toHaveBeenCalledTimes(1);
  });
});
