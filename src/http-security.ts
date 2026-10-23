import type {IncomingMessage} from 'node:http';

import type {ServerStartOptions} from './transport.js';

type CorsOptions = NonNullable<ServerStartOptions['httpStream']>['cors'];

/** Snapshot operator-controlled origins once, when constructing the server. */
export function createHttpOriginPolicy(raw = process.env.APPIUM_MCP_ALLOWED_ORIGINS) {
  const origins = raw?.trim() ? raw.split(',').map((value) => value.trim()) : [];
  for (const origin of origins) {
    let valid = false;
    try {
      const url = new URL(origin);
      valid = ['http:', 'https:'].includes(url.protocol) && url.origin === origin && !origin.includes('*');
    } catch {
      // Fail startup rather than silently weakening a malformed allowlist.
    }
    if (!valid) {
      throw new Error(
        'APPIUM_MCP_ALLOWED_ORIGINS must contain comma-separated exact HTTP(S) origins ' +
          '(scheme://host[:port]), without paths, credentials, wildcards, or null origins.',
      );
    }
  }
  const allowedOrigins = new Set(origins);
  const cors: CorsOptions = origins.length
    ? {origin: [...allowedOrigins], credentials: false, methods: ['GET', 'POST', 'DELETE', 'OPTIONS']}
    : false;

  return {
    cors,
    async authenticate(request?: IncomingMessage): Promise<Record<string, never>> {
      // FastMCP also calls this hook with no request for stdio sessions.
      const origin = request?.headers.origin;
      // Check requests as well as CORS headers: unreadable responses alone do
      // not prevent side effects. Empty, opaque and multiple origins are denied.
      if (origin !== undefined && (typeof origin !== 'string' || !allowedOrigins.has(origin))) {
        throw new Response('Browser origin is not allowed', {status: 403});
      }
      return {};
    },
  };
}
