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
      return supportsMcpAppsCapability(resolveClientCapabilities(session));
    }
  }

  // FastMCP only provides Context.sessionId for HTTP transports. It can also
  // be absent or stale while a capable client session is still active. Recover
  // from positive capability evidence first.
  if (server.sessions.some((session) => supportsMcpAppsCapability(resolveClientCapabilities(session)))) {
    return true;
  }

  // Some stdio hosts, including Codex, render the static resource advertised
  // through tools/list without including the MCP Apps extension in initialize.
  // In that situation capability absence is not negative evidence. Keep the
  // advertised tool metadata and the result representation consistent. Legacy
  // stdio clients can force embedded resources with
  // APPIUM_MCP_APPS_ENABLED=false.
  return server.sessions.some((session) => session.sessionId === undefined);
}

/**
 * FastMCP snapshots client capabilities shortly after connecting. With stdio
 * clients the initialize request can arrive after that retry window, leaving
 * `clientCapabilities` cached as null for the lifetime of the session. The
 * underlying MCP SDK Server continues to expose the initialized capabilities,
 * so use it as the authoritative fallback when FastMCP's cache is empty.
 */
function resolveClientCapabilities(session: FastMCP['sessions'][number]): unknown {
  return session.clientCapabilities ?? session.server.getClientCapabilities();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.replace(/[\s"]/g, '').toLowerCase();
}
