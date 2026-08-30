import {describe, test, expect, jest} from '@jest/globals';

jest.unstable_mockModule('../session-store', () => ({
  getPlatformName: jest.fn(),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isRemoteDriverSession: jest.fn(() => true),
  isXCUITestDriverSession: jest.fn(() => false),
  PLATFORM: {ios: 'iOS', android: 'Android'},
  getCurrentContext: jest.fn(),
  getSessionInfo: jest.fn(),
}));

const {
  execute,
  findElement,
  setValue,
  getElementText,
  getElementAttribute,
  getActiveElement,
  elementClick,
  getElementRect,
  getScreenshot,
  getPageSource,
  getWindowRect,
  getWindowSize,
  performActions,
  queryAppState,
} = await import('../command.js');

// What the remote client resolves with when it swallows a WebDriver error.
const REMOTE_COMMAND_ERROR = {
  error: 'unknown command',
  message: 'Unsupported execute method "mobile: isAppInstalled"',
};

// What the remote client resolves with when it swallows a "no such element" 404.
const NO_SUCH_ELEMENT_VALUE = {
  error: 'no such element',
  message: 'An element could not be located on the page using the given search parameters',
  stacktrace: 'io.appium...ElementNotFoundException',
};

describe('findElement: normalizes remote "no such element"', () => {
  test('re-throws when the client returns a "no such element" value', async () => {
    const driver = {
      findElement: jest.fn(async () => ({
        error: 'no such element',
        message: 'An element could not be located on the page using the given search parameters',
        stacktrace: 'io.appium...ElementNotFoundException',
      })),
    };

    await expect(findElement(driver as never, 'accessibility id', 'zzz-not-here')).rejects.toThrow(
      /could not be located/i,
    );
  });

  test('returns the element unchanged when a real id is present', async () => {
    const el = {
      'element-6066-11e4-a52e-4f735466cecf': 'abc',
      ELEMENT: 'abc',
    };
    const driver = {findElement: jest.fn(async () => el)};

    await expect(findElement(driver as never, 'id', 'real')).resolves.toBe(el);
  });
});

describe('element commands: re-throw swallowed remote "no such element"', () => {
  test('setValue re-throws when elementSendKeys returns an error value', async () => {
    const driver = {
      elementSendKeys: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
    };
    await expect(setValue(driver as never, 'bad', 'hi')).rejects.toThrow(/could not be located/i);
  });

  test('setValue resolves normally when keys are sent', async () => {
    const driver = {elementSendKeys: jest.fn(async () => undefined)};
    await expect(setValue(driver as never, 'el', 'hi')).resolves.toBeUndefined();
  });

  test('getElementText re-throws swallowed error, returns text otherwise', async () => {
    await expect(
      getElementText({getElementText: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never, 'bad'),
    ).rejects.toThrow(/could not be located/i);
    await expect(getElementText({getElementText: jest.fn(async () => 'hello')} as never, 'el')).resolves.toBe('hello');
  });

  test('getElementAttribute re-throws swallowed error; passes null/value through', async () => {
    await expect(
      getElementAttribute(
        {
          getElementAttribute: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
        } as never,
        'bad',
        'enabled',
      ),
    ).rejects.toThrow(/could not be located/i);
    await expect(
      getElementAttribute({getElementAttribute: jest.fn(async () => null)} as never, 'el', 'value'),
    ).resolves.toBeNull();
    await expect(
      getElementAttribute({getElementAttribute: jest.fn(async () => 'true')} as never, 'el', 'enabled'),
    ).resolves.toBe('true');
  });

  test('getActiveElement re-throws swallowed error, returns element otherwise', async () => {
    await expect(
      getActiveElement({
        getActiveElement: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
      } as never),
    ).rejects.toThrow(/could not be located/i);
    const el = {'element-6066-11e4-a52e-4f735466cecf': 'abc'};
    await expect(getActiveElement({getActiveElement: jest.fn(async () => el)} as never)).resolves.toBe(el);
  });

  test('elementClick re-throws swallowed error, resolves otherwise', async () => {
    await expect(
      elementClick({elementClick: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never, 'bad'),
    ).rejects.toThrow(/could not be located/i);
    await expect(elementClick({elementClick: jest.fn(async () => undefined)} as never, 'el')).resolves.toBeUndefined();
  });

  test('getElementRect re-throws swallowed error, returns rect otherwise', async () => {
    await expect(
      getElementRect({getElementRect: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never, 'bad'),
    ).rejects.toThrow(/could not be located/i);
    const rect = {x: 0, y: 0, width: 100, height: 40};
    await expect(getElementRect({getElementRect: jest.fn(async () => rect)} as never, 'el')).resolves.toBe(rect);
  });

  test('getScreenshot(elementId) re-throws swallowed error, returns base64 otherwise', async () => {
    await expect(
      getScreenshot(
        {
          takeElementScreenshot: jest.fn(async () => NO_SUCH_ELEMENT_VALUE),
        } as never,
        'bad',
      ),
    ).rejects.toThrow(/could not be located/i);
    await expect(getScreenshot({takeElementScreenshot: jest.fn(async () => 'base64png')} as never, 'el')).resolves.toBe(
      'base64png',
    );
  });

  test('preserves the W3C error code as the error name (for classifyError)', async () => {
    await expect(
      getElementText({getElementText: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never, 'bad'),
    ).rejects.toMatchObject({name: 'no such element'});
  });
});

describe('execute: normalizes swallowed remote WebDriver errors', () => {
  test('re-throws when executeScript returns an error value', async () => {
    const driver = {
      executeScript: jest.fn(async () => REMOTE_COMMAND_ERROR),
    };

    await expect(execute(driver as never, 'mobile: isAppInstalled', {appId: 'com.example.app'})).rejects.toThrow(
      /Unsupported execute method/i,
    );
  });

  test('returns successful executeScript results unchanged', async () => {
    const driver = {
      executeScript: jest.fn(async () => false),
    };

    await expect(execute(driver as never, 'mobile: isAppInstalled', {appId: 'com.example.app'})).resolves.toBe(false);

    driver.executeScript.mockResolvedValueOnce(true);
    await expect(execute(driver as never, 'mobile: isAppInstalled', {appId: 'com.example.app'})).resolves.toBe(true);
  });

  test('preserves the W3C error code as the error name (for classifyError)', async () => {
    const driver = {
      executeScript: jest.fn(async () => REMOTE_COMMAND_ERROR),
    };

    await expect(execute(driver as never, 'mobile: isAppInstalled', {appId: 'com.example.app'})).rejects.toMatchObject({
      name: 'unknown command',
    });
  });
});

describe('queryAppState: uses execute() on remote clients', () => {
  test('re-throws swallowed remote errors instead of returning NaN', async () => {
    const driver = {
      executeScript: jest.fn(async () => ({
        error: 'unknown command',
        message: 'mobile: queryAppState is not supported',
      })),
    };

    await expect(queryAppState(driver as never, 'com.example.app')).rejects.toThrow(/not supported/i);
  });
});

describe('remote command wrappers: re-throw swallowed WebDriver errors', () => {
  test('performActions re-throws swallowed error values', async () => {
    await expect(
      performActions({performActions: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never, []),
    ).rejects.toThrow(/could not be located/i);
  });

  test('full-screen getScreenshot re-throws swallowed error values', async () => {
    await expect(getScreenshot({takeScreenshot: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never)).rejects.toThrow(
      /could not be located/i,
    );
    await expect(getScreenshot({takeScreenshot: jest.fn(async () => 'base64png')} as never)).resolves.toBe('base64png');
  });

  test('getPageSource re-throws swallowed error values', async () => {
    await expect(getPageSource({getPageSource: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never)).rejects.toThrow(
      /could not be located/i,
    );
    await expect(getPageSource({getPageSource: jest.fn(async () => '<xml/>')} as never)).resolves.toBe('<xml/>');
  });

  test('getWindowRect re-throws swallowed error values', async () => {
    await expect(getWindowRect({getWindowRect: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never)).rejects.toThrow(
      /could not be located/i,
    );
    const rect = {x: 0, y: 0, width: 320, height: 640};
    await expect(getWindowRect({getWindowRect: jest.fn(async () => rect)} as never)).resolves.toBe(rect);
  });

  // Without the guard the error value destructures to undefined width/height,
  // which surfaces as NaN in the gesture maths instead of a real failure.
  test('getWindowSize re-throws swallowed error values', async () => {
    await expect(getWindowSize({getWindowRect: jest.fn(async () => NO_SUCH_ELEMENT_VALUE)} as never)).rejects.toThrow(
      /could not be located/i,
    );
    await expect(
      getWindowSize({getWindowRect: jest.fn(async () => ({x: 0, y: 0, width: 320, height: 640}))} as never),
    ).resolves.toEqual({width: 320, height: 640});
  });
});
