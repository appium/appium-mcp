import { fs } from '@appium/support';
import { createHash } from 'node:crypto';
import path from 'node:path';
import log from './logger.js';
import { resolveAppiumMcpSessionsDir } from './utils/paths.js';
import type { SessionCapabilities, SessionOwnership } from './session-store.js';

/**
 * On-disk representation of a remote Appium session.
 *
 * Persistence allows MCP processes that get recycled by their host (for
 * example, stdio hosts that respawn the server between tool calls) to
 * reattach to the underlying session without losing it.
 *
 * Only sessions that have a `remoteServerUrl` are eligible; local/embedded
 * sessions cannot be rehydrated because their driver instance dies with the
 * process.
 */
export interface PersistedSession {
  sessionId: string;
  remoteServerUrl: string;
  capabilities: SessionCapabilities;
  platform: string | null;
  automationName: string | null;
  deviceName: string | null;
  ownership: SessionOwnership;
}

/**
 * Return the directory where persisted sessions live, or `null` when the
 * feature is disabled.
 *
 * Configured by the `APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH` environment
 * variable: set the variable to a path to opt in. When unset, persistence is
 * dormant and no files are read or written.
 */
export function getPersistenceDir(): string | null {
  return resolveAppiumMcpSessionsDir();
}

/**
 * Convenience boolean for callers that only need to know whether the feature
 * is enabled; the actual path lookup is done by `getPersistenceDir`.
 */
export function isSessionPersistenceEnabled(): boolean {
  return getPersistenceDir() !== null;
}

/**
 * Read every persisted session from the on-disk directory.
 *
 * Returns an empty list when the feature is disabled, when the directory
 * does not exist, or when reads fail. Files that fail to parse are silently
 * skipped (logged at warn level) so a single corrupt file cannot wedge the
 * whole feature.
 */
export async function readAllPersistedSessions(): Promise<PersistedSession[]> {
  const dir = getPersistenceDir();
  if (!dir) {
    return [];
  }
  if (!(await fs.hasAccess(dir))) {
    return [];
  }
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    log.warn(
      `Failed to read persisted sessions directory: ${(err as Error).message}`
    );
    return [];
  }
  const jsonFiles = entries.filter((name) => name.endsWith('.json'));
  const parsed = await Promise.all(
    jsonFiles.map(async (name): Promise<PersistedSession | null> => {
      const filePath = path.join(dir, name);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as PersistedSession;
      } catch (err) {
        log.warn(
          `Skipping persisted session file ${name}: ${(err as Error).message}`
        );
        return null;
      }
    })
  );
  return parsed.filter((entry): entry is PersistedSession => entry !== null);
}

/**
 * Write a single persisted session atomically.
 *
 * Writes to a sibling `.tmp` file first and renames into place so a partial
 * write cannot leave the on-disk entry corrupt. Concurrent writes to the
 * same session id still race on the final rename, but each session lives in
 * its own file so writes to *different* sessions never collide.
 */
export async function writePersistedSession(
  entry: PersistedSession
): Promise<void> {
  const dir = getPersistenceDir();
  if (!dir) {
    return;
  }
  const target = sessionFilePath(entry.sessionId, dir);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(entry, null, 2), 'utf8');
    await fs.rename(tmp, target);
  } catch (err) {
    log.warn(
      `Failed to persist session ${entry.sessionId}: ${(err as Error).message}`
    );
    // Best-effort cleanup of the tmp file. Ignore if it does not exist.
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore
    }
  }
}

/**
 * Remove a single persisted session file.
 *
 * No-op when the feature is disabled or the file does not exist.
 */
export async function removePersistedSession(sessionId: string): Promise<void> {
  const dir = getPersistenceDir();
  if (!dir) {
    return;
  }
  try {
    await fs.unlink(sessionFilePath(sessionId, dir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    log.warn(
      `Failed to remove persisted session ${sessionId}: ${
        (err as Error).message
      }`
    );
  }
}

function sessionFilePath(sessionId: string, dir: string): string {
  const safeName = createHash('sha256').update(sessionId).digest('hex');
  return path.join(dir, `${safeName}.json`);
}
