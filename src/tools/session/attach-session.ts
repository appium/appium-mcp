import { type Client } from 'webdriver';
import {
  detachSession,
  getSessionOwnership,
  listSessions,
  setSession,
  type SessionCapabilities,
  type SessionOwnership,
} from '../../session-store.js';
import { readAllPersistedSessions } from '../../persistence.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';
import { validateRemoteServerUrl } from './create-session.js';
import { attachToRemoteSession, getPortFromUrl } from '../../utils/url.js';

/**
 * Normalize capability payloads returned by Appium/WebdriverIO into a flat
 * capability record.
 *
 * @param value - Raw response payload from session capability APIs.
 * @returns A capability record when one can be derived, otherwise `undefined`.
 */
function readCapabilities(value: unknown): SessionCapabilities | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const nested = record.capabilities ?? record.caps;

  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as SessionCapabilities;
  }

  return record as SessionCapabilities;
}

const METADATA_FIELDS = [
  ['platformName', 'appium:platformName', 'platformName'],
  ['automationName', 'appium:automationName', 'appium:automationName'],
  ['deviceName', 'appium:deviceName', 'appium:deviceName'],
] as const;

/**
 * Attach MCP Appium to an existing remote Appium session without taking
 * ownership of the underlying session lifecycle.
 *
 * Session capabilities are fetched from the server before creating the
 * WebDriver client so that WebDriver.attachToSession receives the full
 * capability set (including platformName) and sessionEnvironmentDetector can
 * correctly configure isMobile / isAndroid / isIOS on the client instance.
 *
 * @param args - Remote server location, target session id, and optional
 *   capability overrides.
 * @returns A tool response describing whether the attachment succeeded.
 */
export async function attachSessionAction(args: {
  remoteServerUrl: string;
  sessionId: string;
  capabilities?: Record<string, any>;
}): Promise<any> {
  try {
    const existingOwnership = getSessionOwnership(args.sessionId);
    if (existingOwnership === 'owned') {
      return errorResult(
        `Session ${args.sessionId} is already managed by MCP Appium as an owned session. Use action=select to activate it.`
      );
    }
    if (existingOwnership === 'attached') {
      detachSession(args.sessionId);
    }

    validateRemoteServerUrl(
      args.remoteServerUrl,
      process.env.REMOTE_SERVER_URL_ALLOW_REGEX
    );

    // Fetch capabilities from the server BEFORE creating the WebDriver client.
    // This ensures WebDriver.attachToSession receives platformName so that
    // sessionEnvironmentDetector configures isMobile / isAndroid / isIOS
    // correctly. Caller-provided capabilities take the lowest priority; the W3C
    // Appium extension endpoint wins.
    const [sessionCapabilities, deprecatedSessionCapabilities] =
      await Promise.all([
        fetchCapabilitiesFromServer(
          args.remoteServerUrl,
          args.sessionId,
          'appium/session_capabilities'
        ),
        fetchCapabilitiesFromServer(args.remoteServerUrl, args.sessionId),
      ]);

    if (
      sessionCapabilities === undefined &&
      deprecatedSessionCapabilities === undefined
    ) {
      return errorResult(
        `Failed to fetch capabilities for session ${args.sessionId} from ${args.remoteServerUrl}. ` +
          `The server may be unreachable or the session may no longer exist.`
      );
    }

    const sources = [
      sessionCapabilities,
      deprecatedSessionCapabilities,
      args.capabilities,
    ];
    const capabilities: SessionCapabilities = Object.assign(
      {},
      args.capabilities ?? {},
      deprecatedSessionCapabilities ?? {},
      sessionCapabilities ?? {}
    );

    const client: Client = await attachToRemoteSession({
      remoteServerUrl: args.remoteServerUrl,
      sessionId: args.sessionId,
      capabilities,
    });

    // Normalize metadata fields into their canonical prefixed forms for
    // local session tracking.
    for (const [plainKey, prefixedKey, targetKey] of METADATA_FIELDS) {
      const source = sources.find(
        (candidate) =>
          candidate?.[plainKey] !== undefined ||
          candidate?.[prefixedKey] !== undefined
      );
      const value = source?.[plainKey] ?? source?.[prefixedKey];
      delete capabilities[plainKey];
      delete capabilities[prefixedKey];
      if (value !== undefined) {
        capabilities[targetKey] = value;
      }
    }

    // If a persisted entry exists for this sessionId from a previous process
    // that owned it, preserve 'owned' so the disconnect handler still cleans
    // it up after this process exits. Users explicitly calling action=attach
    // get the default 'attached' semantics otherwise.
    let desiredOwnership: SessionOwnership = 'attached';
    try {
      const persisted = await readAllPersistedSessions();
      const prior = persisted.find((p) => p.sessionId === args.sessionId);
      if (prior?.ownership === 'owned') {
        desiredOwnership = 'owned';
      }
    } catch {
      // ignore — falling back to 'attached' is safe
    }
    setSession(
      client,
      args.sessionId,
      capabilities,
      desiredOwnership,
      args.remoteServerUrl
    );

    return textResult(
      `Attached to existing session ${args.sessionId}. Active sessions: ${listSessions().length}`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to attach session ${args.sessionId}. ${toolErrorMessage(err)}`
    );
  }
}

/**
 * Fetch session capabilities from the Appium server via a plain HTTP request.
 *
 * Making this request before WebDriver.attachToSession avoids the ordering
 * problem where the client is created before platformName is known.
 *
 * @param remoteServerUrl - Base URL of the Appium server.
 * @param sessionId - ID of the existing session to query.
 * @param endpoint - Optional sub-path after `/session/{id}/`.
 * @returns Parsed capabilities, or `undefined` when the request fails or the
 *   endpoint is not supported by the server.
 */
async function fetchCapabilitiesFromServer(
  remoteServerUrl: string,
  sessionId: string,
  endpoint?: string
): Promise<SessionCapabilities | undefined> {
  try {
    const url = new URL(remoteServerUrl);
    const port = getPortFromUrl(url);
    const basePath = url.pathname.replace(/\/$/, '');
    const path = `${basePath}/session/${sessionId}${endpoint ? '/' + endpoint : ''}`;
    const requestUrl = `${url.protocol}//${url.hostname}:${port}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (url.username && url.password) {
      const credentials = Buffer.from(
        `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
      ).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }

    const response = await fetch(requestUrl, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return undefined;
    }

    const json = (await response.json()) as { value?: unknown };
    return readCapabilities(json.value);
  } catch {
    return undefined;
  }
}
