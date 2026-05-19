import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../session-store.js';
import {
  getDriver,
  listPersistedSessions,
  removePersistedSession,
  setSession,
} from '../session-store.js';
import WebDriver, { type Client } from 'webdriver';
import { URL } from 'node:url';
import log from '../logger.js';

const W3C_ELEMENT_ID = 'element-6066-11e4-a52e-4f735466cecf';

export type DriverOrError =
  | { ok: true; driver: DriverInstance }
  | { ok: false; result: ContentResult };

/**
 * Normalizes unknown errors into a message string for tool responses.
 */
export function toolErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reads the WebDriver element id from a findElement/activeElement payload,
 * or returns the value when the driver already returned a plain id string.
 */
export function readWebElementId(element: unknown): string | undefined {
  if (typeof element === 'string') {
    return element;
  }
  if (element === null || typeof element !== 'object') {
    return undefined;
  }
  const rec = element as Record<string, unknown>;
  const id = rec[W3C_ELEMENT_ID] ?? rec.ELEMENT;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Standard success ContentResult.
 */
export function textResult(text: string): ContentResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Canonical first line: machine-parseable `elementId '<value>'`, then human-readable detail.
 * Strips newlines from elementId so the first line stays one logical field for parsers.
 */
export function textResultWithPrimaryElementId(
  elementId: string,
  detail: string
): ContentResult {
  const safeId = sanitizePrimaryElementIdLine(elementId);
  const d = detail.replace(/^\s+/, '');
  return textResult(`elementId '${safeId}'\n${d}`);
}

/**
 * Standard error ContentResult. Sets isError so MCP clients can handle
 * failures consistently without throwing (which adds an unhelpful prefix).
 */
export function errorResult(text: string): ContentResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Message body for {@link noActiveDriverSessionResult} (shared when throwing from helpers). */
export function noActiveDriverSessionMessage(sessionId?: string): string {
  const ctx = sessionId ? ` for session '${sessionId}'` : '';
  return `No active driver session${ctx}. Use appium_session_management (action=create or action=attach), or pass a valid sessionId.`;
}

/**
 * Standard tool-execution error when no driver is active for the given session.
 * Keeps copy aligned with the registered `appium_session_management` tool.
 */
export function noActiveDriverSessionResult(sessionId?: string): ContentResult {
  return errorResult(noActiveDriverSessionMessage(sessionId));
}

/**
 * Resolves the driver for a tool call or returns a standardised error result.
 * On cache miss, transparently re-attaches to any persisted attached session
 * matching the requested id, so tools survive MCP process recycles.
 * Does not throw.
 */
export async function resolveDriver(
  sessionId?: string
): Promise<DriverOrError> {
  let driver = getDriver(sessionId);
  if (!driver) {
    const rehydrated = await rehydrateAttachedSession(sessionId);
    if (rehydrated) {
      driver = getDriver(sessionId ?? rehydrated.sessionId);
    }
  }
  if (!driver) {
    return { ok: false, result: noActiveDriverSessionResult(sessionId) };
  }
  return { ok: true, driver };
}

async function rehydrateAttachedSession(
  sessionId?: string
): Promise<{ sessionId: string } | null> {
  const persisted = listPersistedSessions();
  if (persisted.length === 0) return null;
  const candidates = sessionId
    ? persisted.filter((p) => p.sessionId === sessionId)
    : persisted;
  for (const entry of candidates) {
    try {
      const url = new URL(entry.remoteServerUrl);
      const protocol = url.protocol.replace(':', '');
      const port = url.port
        ? parseInt(url.port, 10)
        : protocol === 'https'
          ? 443
          : 80;
      const client = await WebDriver.attachToSession({
        sessionId: entry.sessionId,
        protocol,
        hostname: url.hostname,
        port,
        path: url.pathname,
        capabilities: entry.capabilities,
      });
      // attachToSession does not verify liveness on the remote server. Issue
      // a cheap call to confirm the session is still valid before adopting it.
      try {
        await (client as Client).getTimeouts();
      } catch (verifyErr) {
        log.warn(
          `Persisted session ${entry.sessionId} failed liveness check (${
            (verifyErr as Error).message
          }); pruning.`
        );
        removePersistedSession(entry.sessionId);
        continue;
      }
      const seedCaps = {
        ...(entry.capabilities ?? {}),
        platformName: entry.platform ?? undefined,
        'appium:automationName': entry.automationName ?? undefined,
        'appium:deviceName': entry.deviceName ?? undefined,
      };
      setSession(
        client,
        entry.sessionId,
        seedCaps,
        'attached',
        entry.remoteServerUrl
      );
      log.info(
        `Rehydrated attached session ${entry.sessionId} from persisted store.`
      );
      return { sessionId: entry.sessionId };
    } catch (err) {
      log.warn(
        `Persisted session ${entry.sessionId} no longer attachable (${
          (err as Error).message
        }); pruning.`
      );
      removePersistedSession(entry.sessionId);
    }
  }
  return null;
}

/**
 * Returns a standard error result for platform-mismatch cases
 * (e.g. shake is iOS-only, open-notifications is Android-only).
 */
export function platformMismatch(
  action: string,
  expected: string,
  actual: string
): ContentResult {
  return errorResult(
    `action=${action} is ${expected}-only. Current session platform is '${actual}'.`
  );
}

function sanitizePrimaryElementIdLine(elementId: string): string {
  return elementId.replace(/[\r\n]+/g, '').trim();
}
