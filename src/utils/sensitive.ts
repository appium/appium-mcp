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
 * Determines if a given key is considered sensitive based on whether it includes any of the defined sensitive key parts.
 * The check is case-insensitive and ignores non-alphanumeric characters, so keys like "API-Key", "client secret", or "remote_server_url" would all be correctly identified as sensitive.
 * @param key The key to check for sensitivity.
 * @returns True if the key is considered sensitive, false otherwise.
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PARTS.some((part) =>
    normalized.includes(normalizeKey(part))
  );
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
