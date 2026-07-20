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

const {
  findElement,
  setValue,
  getElementText,
  getElementAttribute,
  getActiveElement,
  elementClick,
  getElementRect,
  getScreenshot,
} = await import('../command.js');

// What the remote client resolves with when it swallows a "no such element" 404.
const NO_SUCH_ELEMENT_VALUE = {
  error: 'no such element',
  message:
    'An element could not be located on the page using the given search parameters',
  stacktrace: 'io.appium...ElementNotFoundException',
};

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

describe('element commands: re-throw swallowed remote "no such element"', () => {
  test('setValue re-throws when elementSendKeys returns an error value', async () => {
    const driver = {
      elementSendKeys: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
    };
    await expect(setValue(driver as never, 'bad', 'hi')).rejects.toThrow(
      /could not be located/i
    );
  });

  test('setValue resolves normally when keys are sent', async () => {
    const driver = { elementSendKeys: jest.fn(async () => undefined) };
    await expect(
      setValue(driver as never, 'el', 'hi')
    ).resolves.toBeUndefined();
  });

  test('getElementText re-throws swallowed error, returns text otherwise', async () => {
    await expect(
      getElementText(
        { getElementText: jest.fn(async () => NO_SUCH_ELEMENT_VALUE) } as never,
        'bad'
      )
    ).rejects.toThrow(/could not be located/i);
    await expect(
      getElementText(
        { getElementText: jest.fn(async () => 'hello') } as never,
        'el'
      )
    ).resolves.toBe('hello');
  });

  test('getElementAttribute re-throws swallowed error; passes null/value through', async () => {
    await expect(
      getElementAttribute(
        {
          getElementAttribute: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
        } as never,
        'bad',
        'enabled'
      )
    ).rejects.toThrow(/could not be located/i);
    await expect(
      getElementAttribute(
        { getElementAttribute: jest.fn(async () => null) } as never,
        'el',
        'value'
      )
    ).resolves.toBeNull();
    await expect(
      getElementAttribute(
        { getElementAttribute: jest.fn(async () => 'true') } as never,
        'el',
        'enabled'
      )
    ).resolves.toBe('true');
  });

  test('getActiveElement re-throws swallowed error, returns element otherwise', async () => {
    await expect(
      getActiveElement({
        getActiveElement: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
      } as never)
    ).rejects.toThrow(/could not be located/i);
    const el = { 'element-6066-11e4-a52e-4f735466cecf': 'abc' };
    await expect(
      getActiveElement({ getActiveElement: jest.fn(async () => el) } as never)
    ).resolves.toBe(el);
  });

  test('elementClick re-throws swallowed error, resolves otherwise', async () => {
    await expect(
      elementClick(
        { elementClick: jest.fn(async () => NO_SUCH_ELEMENT_VALUE) } as never,
        'bad'
      )
    ).rejects.toThrow(/could not be located/i);
    await expect(
      elementClick(
        { elementClick: jest.fn(async () => undefined) } as never,
        'el'
      )
    ).resolves.toBeUndefined();
  });

  test('getElementRect re-throws swallowed error, returns rect otherwise', async () => {
    await expect(
      getElementRect(
        { getElementRect: jest.fn(async () => NO_SUCH_ELEMENT_VALUE) } as never,
        'bad'
      )
    ).rejects.toThrow(/could not be located/i);
    const rect = { x: 0, y: 0, width: 100, height: 40 };
    await expect(
      getElementRect(
        { getElementRect: jest.fn(async () => rect) } as never,
        'el'
      )
    ).resolves.toBe(rect);
  });

  test('getScreenshot(elementId) re-throws swallowed error, returns base64 otherwise', async () => {
    await expect(
      getScreenshot(
        {
          takeElementScreenshot: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
        } as never,
        'bad'
      )
    ).rejects.toThrow(/could not be located/i);
    await expect(
      getScreenshot(
        { takeElementScreenshot: jest.fn(async () => 'base64png') } as never,
        'el'
      )
    ).resolves.toBe('base64png');
  });

  test('preserves the W3C error code as the error name (for classifyError)', async () => {
    await expect(
      getElementText(
        { getElementText: jest.fn(async () => NO_SUCH_ELEMENT_VALUE) } as never,
        'bad'
      )
    ).rejects.toMatchObject({ name: 'no such element' });
  });
});
