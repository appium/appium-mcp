const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const SENSITIVE_KEY_PARTS = [
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'clientsecret',
  'credential',
  'password',
  'remote_server_url',
  'remoteserverurl',
  'secret',
  'token',
];

export function isTelemetryEnabled(): boolean {
  return TRUE_VALUES.has(
    process.env.APPIUM_MCP_OTEL_ENABLED?.trim().toLowerCase() ?? ''
  );
}

export function safeAttributeValue(value: unknown): string | number | boolean {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

export function safeSessionId(args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || !('sessionId' in args)) {
    return undefined;
  }

  const sessionId = (args as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : undefined;
}

export function safeInputKeys(args: unknown): string[] {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return [];
  }

  return Object.keys(args)
    .filter((key) => !isSensitiveKey(key))
    .sort();
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) =>
    normalized.includes(part.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
  );
}
