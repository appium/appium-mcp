import {beforeEach, describe, test, expect, jest} from '@jest/globals';

jest.unstable_mockModule('../../../persistence', () => ({
  isSessionPersistenceEnabled: jest.fn(() => false),
  getPersistenceDir: jest.fn(() => null),
  readAllPersistedSessions: jest.fn(async () => []),
  removePersistedSession: jest.fn(async () => {}),
  writePersistedSession: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  getPlatformName: jest.fn(),
  PLATFORM: {ios: 'iOS', android: 'Android'},
  setSession: jest.fn(),
}));

jest.unstable_mockModule('../../../command', () => ({
  execute: jest.fn(),
  getElementRect: jest.fn(),
  getWindowRect: jest.fn(),
  performActions: jest.fn(),
}));

jest.unstable_mockModule('../../../tools/ai/config', () => ({
  isAIEnabled: jest.fn(() => false),
}));

const {execute, getWindowRect, performActions} = await import('../../../command.js');
const {getPlatformName} = await import('../../../session-store.js');
const {parseAiElement} = await import('../../../tools/gestures/handlers/ai-element.js');
const {clampDirectionCoordsToWindow, performVerticalScroll, rectVisibleWithinWindow} =
  await import('../../../tools/gestures/handlers/swipe-scroll.js');

const PHONE_WINDOW = {x: 0, y: 0, width: 400, height: 800};

describe('rectVisibleWithinWindow', () => {
  test('clips ai-element fallback rect that extends past the left edge', () => {
    const parsed = parseAiElement('ai-element:42,84');
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) {
      return;
    }

    const visible = rectVisibleWithinWindow(parsed.rect, PHONE_WINDOW);
    expect(visible.x).toBeGreaterThanOrEqual(0);
    expect(visible.y).toBeGreaterThanOrEqual(0);
    expect(visible.x + visible.width).toBeLessThanOrEqual(PHONE_WINDOW.width);
    expect(visible.y + visible.height).toBeLessThanOrEqual(PHONE_WINDOW.height);
    expect(visible.width).toBeGreaterThan(0);
    expect(visible.height).toBeGreaterThan(0);
  });

  test('returns a 1x1 rect at clamped centre when fully outside the window', () => {
    const offScreen = {x: 500, y: 900, width: 100, height: 100};
    const visible = rectVisibleWithinWindow(offScreen, PHONE_WINDOW);
    expect(visible).toEqual({x: 399, y: 799, width: 1, height: 1});
  });
});

describe('clampDirectionCoordsToWindow', () => {
  test('clamps swipe endpoints into inclusive window pixel bounds', () => {
    const clamped = clampDirectionCoordsToWindow({startX: -20, startY: 900, endX: 500, endY: -10}, PHONE_WINDOW);
    expect(clamped).toEqual({
      startX: 0,
      startY: 799,
      endX: 399,
      endY: 0,
    });
  });

  test('preserves in-bounds directional coords', () => {
    const coords = {startX: 200, startY: 600, endX: 200, endY: 200};
    expect(clampDirectionCoordsToWindow(coords, PHONE_WINDOW)).toEqual(coords);
  });
});

describe('performVerticalScroll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getWindowRect).mockResolvedValue(PHONE_WINDOW);
  });

  test('iOS passes direction and distance through to mobile: scroll', async () => {
    jest.mocked(getPlatformName).mockReturnValue('iOS');
    await performVerticalScroll({} as never, {direction: 'down', distance: 0.5});
    expect(execute).toHaveBeenCalledWith(expect.anything(), 'mobile: scroll', {direction: 'down', distance: 0.5});
    expect(getWindowRect).not.toHaveBeenCalled();
    expect(performActions).not.toHaveBeenCalled();
  });

  test('Android keeps the pointer drag', async () => {
    jest.mocked(getPlatformName).mockReturnValue('Android');
    await performVerticalScroll({} as never, {direction: 'down', distance: 0.5});
    expect(execute).not.toHaveBeenCalled();
    const [sequence] = jest.mocked(performActions).mock.calls[0][1] as Array<{actions: Array<{y?: number}>}>;
    const ys = sequence.actions.filter((a) => a.y !== undefined).map((a) => a.y);
    expect(ys).toEqual([520, 280]);
  });
});
