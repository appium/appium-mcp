import {readBooleanEnv} from './env.js';

/** Reject HTTP(S) app inputs before an embedded driver can download them. */
export function validateEmbeddedAppPath(value: unknown): void {
  if (readBooleanEnv('ALLOW_REMOTE_APP_URLS', true)) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(validateEmbeddedAppPath);
    return;
  }
  if (typeof value !== 'string') {
    return;
  }
  // Appium also accepts otherApps as a JSON-encoded array.
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    // Ordinary file path or URL.
  }
  if (Array.isArray(decoded)) {
    decoded.forEach(validateEmbeddedAppPath);
    return;
  }
  const normalized = value.trim().replace(/[\t\r\n]/g, '');
  if (/^https?:/i.test(normalized)) {
    throw new Error(
      'HTTP(S) app URLs are disabled for embedded sessions by ALLOW_REMOTE_APP_URLS=false. Use a local app path.',
    );
  }
}

/** Check merged capabilities, including Appium's grouped and legacy forms. */
export function validateEmbeddedAppCapabilities(capabilities: Record<string, unknown>): void {
  for (const key of ['app', 'appium:app', 'otherApps', 'appium:otherApps']) {
    validateEmbeddedAppPath(capabilities[key]);
  }
  const options = capabilities['appium:options'];
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    for (const key of ['app', 'appium:app', 'otherApps', 'appium:otherApps']) {
      validateEmbeddedAppPath((options as Record<string, unknown>)[key]);
    }
  }
}
