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
import { attachToRemoteSession } from '../../utils/url.js';

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
 * @param args - Remote server location, target session id, and optional
 *   capability overrides to seed local metadata.
 * @returns A tool response describing whether the attach succeeded.
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

    const client: Client = await attachToRemoteSession({
      remoteServerUrl: args.remoteServerUrl,
      sessionId: args.sessionId,
      capabilities: args.capabilities,
    });

    const [appiumCapabilities, sessionCapabilities] = await Promise.all([
      readClientCapabilities(client, 'getAppiumSessionCapabilities'),
      readClientCapabilities(client, 'getSession'),
    ]);

    const sources = [
      appiumCapabilities,
      sessionCapabilities,
      args.capabilities,
    ];
    const capabilities: SessionCapabilities = Object.assign(
      {},
      args.capabilities ?? {},
      sessionCapabilities ?? {},
      appiumCapabilities ?? {}
    );

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
 * Read capabilities from a WebdriverIO client method when available.
 *
 * @param client - Attached WebdriverIO client for the target Appium session.
 * @param methodName - Capability reader to invoke on the client.
 * @returns Parsed capabilities, or `undefined` when the method is missing or fails.
 */
async function readClientCapabilities(
  client: Client,
  methodName: 'getAppiumSessionCapabilities' | 'getSession'
): Promise<SessionCapabilities | undefined> {
  const method = client[methodName];
  if (typeof method !== 'function') {
    return undefined;
  }

  try {
    return readCapabilities(await method.call(client));
  } catch {
    return undefined;
  }
}
