import { describe, test, expect } from '@jest/globals';
import { parseAiElement } from '../../../tools/gestures/handlers/ai-element.js';
import {
  clampDirectionCoordsToWindow,
  rectVisibleWithinWindow,
} from '../../../tools/gestures/handlers/swipe-scroll.js';

const PHONE_WINDOW = { x: 0, y: 0, width: 400, height: 800 };

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
    const offScreen = { x: 500, y: 900, width: 100, height: 100 };
    const visible = rectVisibleWithinWindow(offScreen, PHONE_WINDOW);
    expect(visible).toEqual({ x: 399, y: 799, width: 1, height: 1 });
  });
});

describe('clampDirectionCoordsToWindow', () => {
  test('clamps swipe endpoints into inclusive window pixel bounds', () => {
    const clamped = clampDirectionCoordsToWindow(
      { startX: -20, startY: 900, endX: 500, endY: -10 },
      PHONE_WINDOW
    );
    expect(clamped).toEqual({
      startX: 0,
      startY: 799,
      endX: 399,
      endY: 0,
    });
  });

  test('preserves in-bounds directional coords', () => {
    const coords = { startX: 200, startY: 600, endX: 200, endY: 200 };
    expect(clampDirectionCoordsToWindow(coords, PHONE_WINDOW)).toEqual(coords);
  });
});
