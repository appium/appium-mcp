/**
 * Helpers for deciding whether telemetry is enabled and for building safe span
 * attributes. This file intentionally exposes only low-cardinality metadata and
 * filtered input names so spans do not capture secrets, screenshots, page
 * source XML, prompts, or other user payloads.
 */

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

/**
 * Determines whether telemetry is enabled based on the APPIUM_MCP_OTEL_ENABLED environment variable.
 * Recognizes "1", "true", "yes", and "on" (case-insensitive) as true values.
 * Defaults to false if the variable is not set or has an unrecognized value.
 * @returns True if telemetry is enabled, false otherwise.
 */
export function isTelemetryEnabled(): boolean {
  return TRUE_VALUES.has(
    process.env.APPIUM_MCP_OTEL_ENABLED?.trim().toLowerCase() ?? ''
  );
}

/**
 * Safely converts a value to a string, number, or boolean for use as a telemetry attribute.
 * If the value is already a string, number, or boolean, it is returned as-is.
 * If the value is null or undefined, an empty string is returned.
 * Otherwise, the value is converted to a string.
 * @param value The value to convert.
 * @returns The safe attribute value.
 */
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

/**
 * Safely extracts the session ID from the given arguments.
 * @param args The arguments object potentially containing a sessionId.
 * @returns The session ID if present and valid, otherwise undefined.
 */
export function safeSessionId(args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || !('sessionId' in args)) {
    return undefined;
  }

  const sessionId = (args as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : undefined;
}

/**
 * Safely extracts the input keys from the given arguments, excluding sensitive keys.
 * @param args The arguments object potentially containing input keys.
 * @returns An array of safe input keys.
 */
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
