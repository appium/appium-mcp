import type {FastMCP} from 'fastmcp';

export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

export function isUIEnabled(): boolean {
  return process.env.NO_UI !== 'true' && process.env.NO_UI !== '1';
}

/**
 * MCP Apps are enabled by default when UI is enabled. Set
 * APPIUM_MCP_APPS_ENABLED=false or 0 to force the embedded UI compatibility
 * path for clients whose MCP Apps renderer is unreliable.
 */
export function isMcpAppsEnabled(): boolean {
  const configuredValue = process.env.APPIUM_MCP_APPS_ENABLED;
  return isUIEnabled() && configuredValue !== 'false' && configuredValue !== '0';
}

export function supportsMcpAppsCapability(capabilities: unknown): boolean {
  if (!isRecord(capabilities) || !isRecord(capabilities.extensions)) {
    return false;
  }

  const uiCapability = capabilities.extensions[MCP_APPS_EXTENSION_ID];
  if (!isRecord(uiCapability) || !Array.isArray(uiCapability.mimeTypes)) {
    return false;
  }

  return uiCapability.mimeTypes.some((mimeType) => {
    if (typeof mimeType !== 'string') {
      return false;
    }

    return normalizeMimeType(mimeType) === MCP_APP_MIME_TYPE;
  });
}

export function clientSupportsMcpApps(
  server: Pick<FastMCP, 'sessions'>,
  context: {sessionId?: string} | undefined,
): boolean {
  if (context?.sessionId !== undefined) {
    const session = server.sessions.find((candidate) => candidate.sessionId === context.sessionId);
    if (session) {
      return supportsMcpAppsCapability(session.clientCapabilities);
    }
  }

  // FastMCP only provides Context.sessionId for HTTP transports. It can also
  // be absent or stale while a capable client session is still active. A
  // failed lookup is therefore inconclusive: recover from positive capability
  // evidence instead of contradicting the static UI metadata already exposed
  // through tools/list. Absence of positive evidence still selects the legacy
  // embedded-resource fallback.
  return server.sessions.some((session) => supportsMcpAppsCapability(session.clientCapabilities));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.replace(/[\s"]/g, '').toLowerCase();
}
