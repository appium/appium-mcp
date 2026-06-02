import { afterEach, describe, expect, test } from '@jest/globals';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  readAllPersistedSessions,
  type PersistedSession,
} from '../persistence.js';

const originalPersistencePath =
  process.env.APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH;
const tempDirs: string[] = [];

afterEach(async () => {
  if (originalPersistencePath === undefined) {
    delete process.env.APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH;
  } else {
    process.env.APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH =
      originalPersistencePath;
  }

  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('readAllPersistedSessions', () => {
  test('skips a legacy file when the canonical hashed file also exists', async () => {
    const dir = await createTempPersistenceDir();
    const sessionId = 'session-123';
    const staleLegacy = persistedSession(sessionId, 'http://stale.example');
    const canonical = persistedSession(sessionId, 'http://valid.example');

    await writeSessionFile(dir, `${sessionId}.json`, staleLegacy);
    await writeSessionFile(dir, hashedSessionFilename(sessionId), canonical);

    const sessions = await readAllPersistedSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId,
      remoteServerUrl: 'http://valid.example',
    });

    await expectFileMissing(path.join(dir, `${sessionId}.json`));
    await expectCanonicalSession(dir, sessionId, 'http://valid.example');
  });

  test('removes a non-canonical duplicate when the canonical file also exists', async () => {
    const dir = await createTempPersistenceDir();
    const sessionId = 'session-456';
    const staleDuplicate = persistedSession(sessionId, 'http://stale.example');
    const canonical = persistedSession(sessionId, 'http://valid.example');

    await writeSessionFile(dir, 'duplicate-session.json', staleDuplicate);
    await writeSessionFile(dir, hashedSessionFilename(sessionId), canonical);

    const sessions = await readAllPersistedSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId,
      remoteServerUrl: 'http://valid.example',
    });

    await expectFileMissing(path.join(dir, 'duplicate-session.json'));
    await expectCanonicalSession(dir, sessionId, 'http://valid.example');
  });

  test('coalesces non-canonical duplicates when no canonical file exists yet', async () => {
    const dir = await createTempPersistenceDir();
    const sessionId = 'session-789';

    await writeSessionFile(
      dir,
      `${sessionId}.json`,
      persistedSession(sessionId, 'http://legacy.example')
    );
    await writeSessionFile(
      dir,
      'duplicate-session.json',
      persistedSession(sessionId, 'http://duplicate.example')
    );

    const sessions = await readAllPersistedSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe(sessionId);
    expect(['http://legacy.example', 'http://duplicate.example']).toContain(
      sessions[0]?.remoteServerUrl
    );

    await expectFileMissing(path.join(dir, `${sessionId}.json`));
    await expectFileMissing(path.join(dir, 'duplicate-session.json'));
    await expectCanonicalSession(dir, sessionId, sessions[0]!.remoteServerUrl);
  });

  test('still migrates and returns a legacy file when no canonical file exists', async () => {
    const dir = await createTempPersistenceDir();
    const sessionId = 'legacy-session';
    const legacy = persistedSession(sessionId, 'http://legacy.example');

    await writeSessionFile(dir, `${sessionId}.json`, legacy);

    const sessions = await readAllPersistedSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId,
      remoteServerUrl: 'http://legacy.example',
    });

    await expectFileMissing(path.join(dir, `${sessionId}.json`));
    await expectCanonicalSession(dir, sessionId, 'http://legacy.example');
  });
});

async function createTempPersistenceDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'appium-mcp-sessions-'));
  tempDirs.push(dir);
  process.env.APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH = dir;
  return dir;
}

async function writeSessionFile(
  dir: string,
  name: string,
  session: PersistedSession
): Promise<void> {
  await writeFile(path.join(dir, name), JSON.stringify(session, null, 2));
}

function persistedSession(
  sessionId: string,
  remoteServerUrl: string
): PersistedSession {
  return {
    sessionId,
    remoteServerUrl,
    capabilities: { platformName: 'Android' },
    platform: 'Android',
    automationName: 'UiAutomator2',
    deviceName: 'Pixel',
    ownership: 'attached',
  };
}

function hashedSessionFilename(sessionId: string): string {
  return `${createHash('sha256').update(sessionId).digest('hex')}.json`;
}

async function expectFileExists(filePath: string): Promise<void> {
  await expect(access(filePath, constants.F_OK)).resolves.toBeUndefined();
}

async function expectFileMissing(filePath: string): Promise<void> {
  await expect(access(filePath, constants.F_OK)).rejects.toThrow();
}

async function expectCanonicalSession(
  dir: string,
  sessionId: string,
  remoteServerUrl: string
): Promise<void> {
  const filePath = path.join(dir, hashedSessionFilename(sessionId));
  await expectFileExists(filePath);
  const raw = await readFile(filePath, 'utf8');
  expect(JSON.parse(raw)).toMatchObject({ sessionId, remoteServerUrl });
}
