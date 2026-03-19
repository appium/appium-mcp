import { describe, test, expect, jest } from '@jest/globals';

// Mock modules used by the capability builders
await jest.unstable_mockModule('../../../tools/session/select-device', () => ({
  getSelectedDevice: () => 'device-udid',
  getSelectedDeviceType: () => 'simulator',
  getSelectedDeviceInfo: () => ({ name: 'iPhone 12', platform: '16.0' }),
  clearSelectedDevice: () => {},
}));

await jest.unstable_mockModule('../../../devicemanager/ios-manager', () => ({
  IOSManager: {
    getInstance: () => ({
      getDevicesByType: async (_t: any) => [{ udid: 'u1' }],
    }),
  },
}));

await jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

// Mock external driver packages to avoid loading heavy native modules
await jest.unstable_mockModule('appium-uiautomator2-driver', () => ({
  AndroidUiautomator2Driver: class {},
}));
await jest.unstable_mockModule('appium-xcuitest-driver', () => ({
  XCUITestDriver: class {},
}));
await jest.unstable_mockModule('webdriver', () => ({
  default: { newSession: async () => ({ sessionId: 'remote-session' }) },
}));

const module = await import('../../../tools/session/create-session.js');
const {
  buildAndroidCapabilities,
  buildIOSCapabilities,
  getPortFromUrl,
  validateRemoteServerUrl,
} = module;

describe('capability builders', () => {
  test('buildAndroidCapabilities includes udid for local server and removes empty values', () => {
    const configCaps = { 'appium:app': '/path/app.apk' };
    const customCaps = { 'appium:deviceName': '' };
    const caps = buildAndroidCapabilities(configCaps, customCaps, false);
    expect(caps.platformName).toBe('Android');
    expect(caps['appium:app']).toBe('/path/app.apk');
    expect(caps['appium:udid']).toBe('device-udid');
    expect(caps).not.toHaveProperty('appium:deviceName');
    expect(caps['appium:settings[actionAcknowledgmentTimeout]']).toBe(0);
    expect(caps['appium:settings[waitForIdleTimeout]']).toBe(0);
    expect(caps['appium:settings[waitForSelectorTimeout]']).toBe(0);
  });

  test('buildAndroidCapabilities does not include udid for remote server', () => {
    const caps = buildAndroidCapabilities({}, undefined, true);
    expect(caps.platformName).toBe('Android');
    expect(caps).not.toHaveProperty('appium:udid');
  });

  test('buildIOSCapabilities uses selected device info for local simulator', async () => {
    const configCaps = { 'custom:cap': 'value' };
    const customCaps = { 'appium:bundleId': 'com.example.app' };
    const caps = await buildIOSCapabilities(configCaps, customCaps, false);
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:deviceName']).toBe('iPhone 12');
    expect(caps['appium:platformVersion']).toBe('16.0');
    expect(caps['appium:usePrebuiltWDA']).toBe(true);
    expect(caps['appium:wdaStartupRetries']).toBe(4);
    expect(caps['custom:cap']).toBe('value');
    expect(caps['appium:bundleId']).toBe('com.example.app');
  });

  test('buildIOSCapabilities for remote server falls back to defaults', async () => {
    const caps = await buildIOSCapabilities({}, undefined, true);
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:deviceName']).toBe('iPhone Simulator');
    expect(caps).not.toHaveProperty('appium:udid');
  });
});

describe('remote server URL port handling', () => {
  test('should use port 443 for https URLs without explicit port', () => {
    const url = new URL('https://hub-cloud.browserstack.com/wd/hub');
    expect(getPortFromUrl(url)).toBe(443);
  });

  test('should use port 80 for http URLs without explicit port', () => {
    const url = new URL('http://localhost/wd/hub');
    expect(getPortFromUrl(url)).toBe(80);
  });

  test('should use explicit port when provided', () => {
    const url = new URL('http://localhost:4723/wd/hub');
    expect(getPortFromUrl(url)).toBe(4723);
  });

  test('should use explicit port 443 in https URL', () => {
    // Note: URL.port returns empty string for default ports even when explicitly specified
    const url = new URL('https://example.com:443/path');
    expect(getPortFromUrl(url)).toBe(443);
  });

  test('should handle non-default https port', () => {
    const url = new URL('https://example.com:8443/path');
    expect(getPortFromUrl(url)).toBe(8443);
  });
});

describe('validateRemoteServerUrl', () => {
  test.each(['http://localhost:4723', 'https://example.com'])(
    'should not throw for valid URL: %s',
    (url) => {
      expect(() => validateRemoteServerUrl(url)).not.toThrow();
    }
  );

  test.each(['invalid-url', 'ftp://example.com'])(
    'should throw for invalid URL: %s',
    (url) => {
      expect(() => validateRemoteServerUrl(url)).toThrow(
        `Invalid remoteServerUrl: ${url}. Please provide a valid URL (e.g., http://localhost:4723).`
      );
    }
  );

  test.each(['ftp://localhost:4723', 'http://localhost:4723'])(
    'should not throw for valid URL: %s with regex rule',
    (url) => {
      expect(() =>
        validateRemoteServerUrl(url, '^.+//localhost:4723(/.*)?$')
      ).not.toThrow();
    }
  );

  test.each(['ftp://localhost:4723', 'http://localhost:5000'])(
    'should throw for invalid URL: %s with regex rule',
    (url) => {
      expect(() =>
        validateRemoteServerUrl(url, '^https?://localhost:4723(/.*)?$')
      ).toThrow(
        `Invalid remoteServerUrl: ${url}. Please provide a valid URL (e.g., http://localhost:4723).`
      );
    }
  );
});
