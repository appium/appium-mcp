import {describe, test, expect, jest} from '@jest/globals';

jest.unstable_mockModule('../../../persistence', () => ({
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  setSession: jest.fn(),
  getPlatformName: jest.fn((driver: {isIOS?: boolean}) => (driver.isIOS ? 'iOS' : 'Android')),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isRemoteDriverSession: jest.fn(() => true),
  isXCUITestDriverSession: jest.fn(() => false),
  PLATFORM: {ios: 'iOS', android: 'Android'},
  getCurrentContext: jest.fn(),
  getSessionInfo: jest.fn(),
}));

jest.unstable_mockModule('../../../logger', () => ({
  default: {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}},
}));

const mockPerformVerticalScroll = jest.fn(async () => undefined);

jest.unstable_mockModule('../../../tools/gestures/handlers/swipe-scroll.js', () => ({
  performVerticalScroll: mockPerformVerticalScroll,
}));

const {handleScrollToElement, withoutVisibleConjunct} =
  await import('../../../tools/gestures/handlers/scroll-to-element.js');

function resultText(result: {content: Array<{type: string}>}): string {
  return (result.content[0] as unknown as {text: string}).text;
}

const NO_SUCH_ELEMENT = {
  error: 'no such element',
  message: 'An element could not be located on the page using the given search parameters',
};

describe('handleScrollToElement', () => {
  test('does not treat remote swallowed no-such-element as already visible', async () => {
    const remoteDriver = {
      findElement: jest.fn(async () => NO_SUCH_ELEMENT),
      getPageSource: jest
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce('<before/>')
        .mockResolvedValueOnce('<after/>'),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      action: 'scroll_to_element',
      strategy: 'accessibility id',
      selector: 'missing',
      maxScrollAttempts: 1,
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('not visible after 1 scroll');
    expect(resultText(result)).not.toContain('already visible');
    expect(mockPerformVerticalScroll).toHaveBeenCalledTimes(1);
  });

  test('reports already visible when findElement succeeds', async () => {
    const remoteDriver = {
      findElement: jest.fn(async () => ({
        'element-6066-11e4-a52e-4f735466cecf': 'el-1',
      })),
      getPageSource: jest.fn(async () => '<xml/>'),
      isElementDisplayed: jest.fn(async () => true),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      action: 'scroll_to_element',
      strategy: 'accessibility id',
      selector: 'submit',
      maxScrollAttempts: 1,
    });

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('already visible');
    expect(mockPerformVerticalScroll).not.toHaveBeenCalled();
  });
});

const args = {
  action: 'scroll_to_element' as const,
  strategy: 'accessibility id' as const,
  selector: 'target',
  maxScrollAttempts: 1,
};
function makeDriver() {
  return {
    findElement: jest.fn(async (_strategy: string, _selector: string) => ({ELEMENT: 'target-id'})),
    isElementDisplayed: jest.fn<() => Promise<unknown>>(async () => true),
    getPageSource: jest.fn<() => Promise<string>>().mockResolvedValueOnce('<before/>').mockResolvedValue('<after/>'),
  };
}
describe('visibility checks', () => {
  test('scrolls an existing but hidden element and rechecks visibility', async () => {
    const driver = makeDriver();
    driver.isElementDisplayed.mockResolvedValueOnce(false).mockResolvedValue(true);
    mockPerformVerticalScroll.mockClear();
    const result = await handleScrollToElement(driver as never, args);
    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('after 1 scroll');
    expect(mockPerformVerticalScroll).toHaveBeenCalledTimes(1);
    expect(driver.isElementDisplayed).toHaveBeenCalledTimes(2);
  });
  test.each([false, 'false', 0, null])('does not treat %j as visible', async (value) => {
    const driver = makeDriver();
    driver.isElementDisplayed.mockResolvedValue(value);
    expect((await handleScrollToElement(driver as never, args)).isError).toBe(true);
  });
  test('propagates invalid selectors without scrolling', async () => {
    const driver = makeDriver();
    driver.findElement.mockRejectedValue(new Error('invalid selector'));
    mockPerformVerticalScroll.mockClear();
    const result = await handleScrollToElement(driver as never, args);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('invalid selector');
    expect(mockPerformVerticalScroll).not.toHaveBeenCalled();
  });
  test('stops when the page remains unchanged and target remains hidden', async () => {
    const driver = makeDriver();
    driver.isElementDisplayed.mockResolvedValue(false);
    driver.getPageSource.mockReset().mockResolvedValue('<same/>');
    expect(resultText(await handleScrollToElement(driver as never, args))).toContain('page source did not change');
  });
  function iosDriver() {
    return {
      ...makeDriver(),
      isIOS: true,
      getAppiumContext: jest.fn(async () => 'NATIVE_APP'),
      getElementAttribute: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => true),
      getElementRect: jest.fn(async () => ({x: 10, y: 100, width: 40, height: 40})),
      getWindowRect: jest.fn(async () => ({x: 0, y: 0, width: 390, height: 844})),
    };
  }
  test('scrolls a visible iOS target obscured by a bar', async () => {
    const driver = iosDriver();
    driver.getElementAttribute.mockResolvedValueOnce(false).mockResolvedValue(true);
    const result = await handleScrollToElement(driver as never, args);
    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('after 1 scroll');
    expect(driver.getElementAttribute).toHaveBeenCalledWith('target-id', 'hittable');
  });
  test('rejects an iOS target outside the window even when hittable', async () => {
    const driver = iosDriver();
    driver.getElementRect.mockResolvedValue({x: 0, y: 840, width: 20, height: 40});
    expect((await handleScrollToElement(driver as never, args)).isError).toBe(true);
  });
  test('searches beyond a simple iOS visibility clause', async () => {
    const driver = iosDriver();
    driver.isElementDisplayed.mockResolvedValueOnce(false).mockResolvedValue(true);
    const result = await handleScrollToElement(driver as never, {
      ...args,
      strategy: '-ios predicate string',
      selector: "name == 'target' AND visible == 1",
    });
    expect(result.isError).toBeFalsy();
    expect(driver.findElement).toHaveBeenCalledWith('-ios predicate string', "name == 'target'");
  });
  test('does not request native hittability in webviews', async () => {
    const driver = iosDriver();
    driver.getAppiumContext.mockResolvedValue('WEBVIEW_1');
    expect((await handleScrollToElement(driver as never, args)).isError).toBeFalsy();
    expect(driver.getElementAttribute).not.toHaveBeenCalled();
  });
});

describe('visibility predicate normalization', () => {
  test.each([
    ["name == 'View All' AND visible == 1", "name == 'View All'"],
    ["visible == true AND name == 'View All'", "name == 'View All'"],
    ["name == 'Rock AND Roll' AND visible == YES", "name == 'Rock AND Roll'"],
  ])('normalizes %s', (input, expected) => expect(withoutVisibleConjunct(input)).toBe(expected));
  test.each([
    "name == 'A' OR visible == 1",
    'NOT visible == 1',
    "(name == 'A') AND visible == 1",
    "name == 'visible == 1'",
    'visible == 1',
    "visible == 0 AND name == 'A'",
  ])('preserves %s', (input) => expect(withoutVisibleConjunct(input)).toBe(input));
});
