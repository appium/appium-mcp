import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../persistence', () => ({
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  setSession: jest.fn(),
  getPlatformName: jest.fn(),
  isAndroidUiautomator2DriverSession: jest.fn(() => false),
  isRemoteDriverSession: jest.fn(() => true),
  isXCUITestDriverSession: jest.fn(() => false),
  PLATFORM: { ios: 'iOS', android: 'Android' },
  getCurrentContext: jest.fn(),
  getSessionInfo: jest.fn(),
}));

jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const mockPerformVerticalScroll = jest.fn(async () => undefined);

jest.unstable_mockModule(
  '../../../tools/gestures/handlers/swipe-scroll.js',
  () => ({
    performVerticalScroll: mockPerformVerticalScroll,
  })
);

const { handleScrollToElement } =
  await import('../../../tools/gestures/handlers/scroll-to-element.js');

const NO_SUCH_ELEMENT = {
  error: 'no such element',
  message:
    'An element could not be located on the page using the given search parameters',
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
      strategy: 'accessibility id',
      selector: 'missing',
      maxScrollAttempts: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found after 1 scroll');
    expect(result.content[0].text).not.toContain('already visible');
    expect(mockPerformVerticalScroll).toHaveBeenCalledTimes(1);
  });

  test('reports already visible when findElement succeeds', async () => {
    const remoteDriver = {
      findElement: jest.fn(async () => ({
        'element-6066-11e4-a52e-4f735466cecf': 'el-1',
      })),
      getPageSource: jest.fn(async () => '<xml/>'),
    };
    mockPerformVerticalScroll.mockClear();

    const result = await handleScrollToElement(remoteDriver as never, {
      strategy: 'accessibility id',
      selector: 'submit',
      maxScrollAttempts: 1,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('already visible');
    expect(mockPerformVerticalScroll).not.toHaveBeenCalled();
  });
});
