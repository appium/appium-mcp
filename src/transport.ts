import type {FastMCP} from 'fastmcp';

export type ServerStartOptions = NonNullable<Parameters<FastMCP['start']>[0]>;

export const TRANSPORT_TYPES = {
  stdio: 'stdio',
  httpStream: 'httpStream',
} as const satisfies Record<string, ServerStartOptions['transportType']>;

export const DEFAULT_HTTP_STREAM_OPTIONS = {
  endpoint: '/sse',
  port: 8080,
} as const satisfies NonNullable<ServerStartOptions['httpStream']>;
