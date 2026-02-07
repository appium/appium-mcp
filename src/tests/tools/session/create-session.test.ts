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
    getInstance: () => ({ getDevicesByType: async (t: any) => [{ udid: 'u1' }] }),
  },
}));

await jest.unstable_mockModule('../../../logger', () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));

// Mock external driver packages to avoid loading heavy native modules
await jest.unstable_mockModule('appium-uiautomator2-driver', () => ({ AndroidUiautomator2Driver: class {} }));
await jest.unstable_mockModule('appium-xcuitest-driver', () => ({ XCUITestDriver: class {} }));
await jest.unstable_mockModule('webdriver', () => ({ default: { newSession: async () => ({ sessionId: 'remote-session' }) } }));


// @ts-ignore - allow import of TS module in Jest ESM environment
const module = await import('../../../tools/session/create-session');
const { buildAndroidCapabilities, buildIOSCapabilities } = module;

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
