const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

/** Strict operator settings: typos must not silently enable or disable features. */
export function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  switch (value.trim().toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new Error(`${name} must be true or false.`);
  }
}

export function validateConnectionPolicyEnv(): void {
  readBooleanEnv('REMOTE_SERVER_ENABLE_DIRECT_CONNECT', true);
  readBooleanEnv('ALLOW_REMOTE_APP_URLS', true);
}

export function isTruthyEnvValue(value: string | undefined): boolean {
  return TRUE_VALUES.has(value?.trim().toLowerCase() ?? '');
}
