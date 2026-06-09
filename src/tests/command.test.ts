import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../session-store', () => ({
  getPlatformName: jest.fn(),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isRemoteDriverSession: jest.fn(() => true),
  isXCUITestDriverSession: jest.fn(() => false),
  PLATFORM: { ios: 'iOS', android: 'Android' },
  getCurrentContext: jest.fn(),
  getSessionInfo: jest.fn(),
}));

const { findElement } = await import('../command.js');

describe('findElement: normalizes remote "no such element"', () => {
  test('re-throws when the client returns a "no such element" value', async () => {
    const driver = {
      findElement: jest.fn(async () => ({
        error: 'no such element',
        message:
          'An element could not be located on the page using the given search parameters',
        stacktrace: 'io.appium...ElementNotFoundException',
      })),
    };

    await expect(
      findElement(driver as never, 'accessibility id', 'zzz-not-here')
    ).rejects.toThrow(/could not be located/i);
  });

  test('returns the element unchanged when a real id is present', async () => {
    const el = {
      'element-6066-11e4-a52e-4f735466cecf': 'abc',
      ELEMENT: 'abc',
    };
    const driver = { findElement: jest.fn(async () => el) };

    await expect(findElement(driver as never, 'id', 'real')).resolves.toBe(el);
  });
});
