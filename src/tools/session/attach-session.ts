import WebDriver from 'webdriver';
import { URL } from 'node:url';
import { listSessions, setSession, type SessionCapabilities } from '../../session-store.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';
import { getPortFromUrl, validateRemoteServerUrl } from './create-session.js';

function getAttachedCapabilities(client: unknown): SessionCapabilities {
  if (!client || typeof client !== 'object') {
    return {};
  }
  const maybeClient = client as {
    capabilities?: SessionCapabilities;
    caps?: SessionCapabilities;
  };
  return maybeClient.capabilities ?? maybeClient.caps ?? {};
}

export async function attachSessionAction(args: {
  remoteServerUrl: string;
  sessionId: string;
  capabilities?: Record<string, any>;
}): Promise<any> {
  try {
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

    const client = await (
      WebDriver as unknown as {
        attachToSession: (options: Record<string, unknown>) => Promise<unknown>;
      }
    ).attachToSession({
      sessionId: args.sessionId,
      protocol,
      hostname: remoteUrl.hostname,
      port,
      path: remoteUrl.pathname,
      ...(user && key ? { user, key } : {}),
    });

    const capabilities = args.capabilities ?? getAttachedCapabilities(client);
    setSession(
      client as Parameters<typeof setSession>[0],
      args.sessionId,
      capabilities,
      'attached'
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
