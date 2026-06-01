import WebDriver, { type Client } from 'webdriver';

export interface RemoteAttachOptions {
  remoteServerUrl: string;
  sessionId: string;
  capabilities?: Record<string, unknown>;
}

/**
 * Resolve the port to use for a given URL.
 *
 * Defaults to 443 for https and 80 for http when no explicit port is set.
 */
export function getPortFromUrl(url: URL): number {
  return Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
}

/**
 * Attach to an existing remote Appium session given its server URL and id.
 *
 * Centralises the parsing of protocol, hostname, port and credentials from
 * the URL so multiple call sites (explicit `action=attach` and the
 * cache-miss rehydrate path in `resolveDriver`) share a single
 * implementation.
 */
export async function attachToRemoteSession(
  options: RemoteAttachOptions
): Promise<Client> {
  const url = new URL(options.remoteServerUrl);
  const protocol = url.protocol.replace(':', '');
  const port = getPortFromUrl(url);
  const user = url.username ? decodeURIComponent(url.username) : undefined;
  const key = url.password ? decodeURIComponent(url.password) : undefined;
  return WebDriver.attachToSession({
    sessionId: options.sessionId,
    protocol,
    hostname: url.hostname,
    port,
    path: url.pathname,
    capabilities: options.capabilities ?? {},
    ...(user && key ? { user, key } : {}),
  });
}
