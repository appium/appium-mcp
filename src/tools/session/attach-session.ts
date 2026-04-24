import WebDriver, { type Client } from 'webdriver';
import { URL } from 'node:url';
import { detachSession, getSessionOwnership, listSessions, setSession, type SessionCapabilities } from '../../session-store.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';
import { getPortFromUrl, validateRemoteServerUrl } from './create-session.js';

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

    const remoteUrl = new URL(args.remoteServerUrl);
    const protocol = remoteUrl.protocol.replace(':', '');
    const port = getPortFromUrl(remoteUrl);
    const user = remoteUrl.username
      ? decodeURIComponent(remoteUrl.username)
      : undefined;
    const key = remoteUrl.password
      ? decodeURIComponent(remoteUrl.password)
      : undefined;

    const client: Client = await WebDriver.attachToSession({
      sessionId: args.sessionId,
      protocol,
      hostname: remoteUrl.hostname,
      port,
      path: remoteUrl.pathname,
      capabilities: args.capabilities,
      ...(user && key ? { user, key } : {}),
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

    setSession(client, args.sessionId, capabilities, 'attached');

    return textResult(
      `Attached to existing session ${args.sessionId}. Active sessions: ${listSessions().length}`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to attach session ${args.sessionId}. ${toolErrorMessage(err)}`
    );
  }
}
