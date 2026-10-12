import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';

const attachToSession = jest.fn<() => Promise<any>>();
const removePersistedSession = jest.fn(async () => {});
jest.unstable_mockModule('webdriver', () => ({default: {attachToSession}}));
jest.unstable_mockModule('../persistence.js', () => ({
  readAllPersistedSessions: async () => [],
  removePersistedSession,
  writePersistedSession: async () => {},
}));

const {attachSessionAction} = await import('../tools/session/attach-session.js');
const {setSession, getSessionInfo, detachSession} = await import('../session-store.js');
const sessionId = 'reattach-test';
const originalUrl = 'http://localhost:4723';
const replacementUrl = 'http://localhost:4725';
let originalDriver: any;
let fetchMock: jest.SpiedFunction<typeof fetch>;
let originalInfo: ReturnType<typeof getSessionInfo>;

beforeEach(async () => {
  originalDriver = {sessionId, deleteSession: jest.fn(async () => {})};
  await setSession(originalDriver, sessionId, {platformName: 'Android'}, 'attached', originalUrl);
  originalInfo = getSessionInfo(sessionId);
  removePersistedSession.mockClear();
  attachToSession.mockReset();
  attachToSession.mockResolvedValue({sessionId});
  fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({value: {platformName: 'Android'}}),
  } as Response);
});

afterEach(() => {
  if (getSessionInfo(sessionId)) {
    detachSession(sessionId);
  }
  fetchMock.mockRestore();
});

describe('reattaching an existing session', () => {
  test.each(['invalid URL', 'capabilities unavailable', 'client attachment failed'])(
    'retains the original registry and persisted entry after %s',
    async (failure) => {
      if (failure === 'capabilities unavailable') {
        fetchMock.mockResolvedValue({ok: false} as Response);
      } else if (failure === 'client attachment failed') {
        attachToSession.mockRejectedValue(new Error('attachment failed'));
      }

      const result = await attachSessionAction({
        sessionId,
        remoteServerUrl: failure === 'invalid URL' ? 'invalid-url' : replacementUrl,
      });

      expect(result.isError).toBe(true);
      expect(getSessionInfo(sessionId)).toBe(originalInfo);
      expect(removePersistedSession).not.toHaveBeenCalled();
      expect(originalDriver.deleteSession).not.toHaveBeenCalled();
    },
  );

  test('replaces the driver after attachment succeeds without scheduling a persisted-file deletion', async () => {
    const replacement = {sessionId};
    attachToSession.mockResolvedValue(replacement);
    const result = await attachSessionAction({sessionId, remoteServerUrl: replacementUrl});

    expect(result.isError).toBeFalsy();
    expect(getSessionInfo(sessionId)).toMatchObject({driver: replacement, remoteServerUrl: replacementUrl});
    expect(removePersistedSession).not.toHaveBeenCalled();
    expect(originalDriver.deleteSession).not.toHaveBeenCalled();
  });
});
