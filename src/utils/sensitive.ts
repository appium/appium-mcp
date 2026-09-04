const SENSITIVE_KEY_PARTS = [
  'access_key',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'clientsecret',
  'credential',
  'passphrase',
  'password',
  'private_key',
  'remote_server_url',
  'remoteserverurl',
  'secret',
  'token',
];

const URL_USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi;

/**
 * Determines if a given key is considered sensitive based on whether it includes any of the defined sensitive key parts.
 * The check is case-insensitive and ignores non-alphanumeric characters, so keys like "API-Key", "client secret", or "remote_server_url" would all be correctly identified as sensitive.
 * @param key The key to check for sensitivity.
 * @returns True if the key is considered sensitive, false otherwise.
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(normalizeKey(part)));
}

/** Removes username/password URL userinfo from text intended for logs or errors. */
export function redactUrlCredentials(value: string): string {
  return value.replace(URL_USERINFO_PATTERN, '$1[REDACTED]@');
}

/**
 * Produces a JSON-safe copy for logs, redacting sensitive keys, URL userinfo,
 * and values large enough to make logs unsafe or impractical.
 */
export function redactForLogging(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  try {
    return JSON.parse(
      JSON.stringify(value, (key, nestedValue) => {
        if (key && isSensitiveKey(key)) {
          return '[REDACTED]';
        }
        if (typeof nestedValue === 'string') {
          if (nestedValue.length > 2000) {
            return `[string:${nestedValue.length}]`;
          }
          return redactUrlCredentials(nestedValue);
        }
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(nestedValue)) {
          return `[buffer:${(nestedValue as Buffer).length}]`;
        }
        return nestedValue;
      }),
    );
  } catch {
    return '[Unserializable value]';
  }
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
