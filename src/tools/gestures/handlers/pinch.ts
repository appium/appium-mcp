import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../../session-store.js';
import { getPlatformName, PLATFORM } from '../../../session-store.js';
import {
  execute,
  getElementRect,
  getWindowRect,
  performActions,
} from '../../../command.js';
import {
  errorResult,
  textResult,
  toolErrorMessage,
} from '../../tool-response.js';
import type { GestureArgs } from '../schema.js';

const DEFAULT_VELOCITY = 2.2;
const DEFAULT_PINCH_SPREAD_RATIO = 0.3;
const MIN_ELEMENT_PINCH_SPREAD_RATIO = 0.15;

type RectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PinchTarget = {
  cx: number;
  cy: number;
  spread: number;
};

export function resolveElementPinchTarget(
  elementRect: RectLike,
  windowRect: RectLike
): PinchTarget {
  const windowLeft = windowRect.x ?? 0;
  const windowTop = windowRect.y ?? 0;
  const windowRight = windowLeft + windowRect.width;
  const windowBottom = windowTop + windowRect.height;

  const visibleLeft = Math.max(windowLeft, elementRect.x);
  const visibleTop = Math.max(windowTop, elementRect.y);
  const visibleRight = Math.min(windowRight, elementRect.x + elementRect.width);
  const visibleBottom = Math.min(
    windowBottom,
    elementRect.y + elementRect.height
  );

  const rawCx =
    visibleRight > visibleLeft
      ? visibleLeft + (visibleRight - visibleLeft) / 2
      : elementRect.x + elementRect.width / 2;
  const rawCy =
    visibleBottom > visibleTop
      ? visibleTop + (visibleBottom - visibleTop) / 2
      : elementRect.y + elementRect.height / 2;

  const cx = Math.floor(clamp(rawCx, windowLeft, windowRight - 1));
  const cy = Math.floor(clamp(rawCy, windowTop, windowBottom - 1));
  const windowBase = Math.min(windowRect.width, windowRect.height);
  const elementBase = Math.min(elementRect.width, elementRect.height);
  const desired = Math.max(
    Math.floor(elementBase * DEFAULT_PINCH_SPREAD_RATIO),
    Math.floor(windowBase * MIN_ELEMENT_PINCH_SPREAD_RATIO)
  );
  const cappedDesired = Math.min(
    desired,
    Math.floor(windowBase * DEFAULT_PINCH_SPREAD_RATIO)
  );

  return {
    cx,
    cy,
    spread: Math.min(cappedDesired, maxSpreadForCenter(cx, cy, windowRect)),
  };
}

export async function handlePinchZoom(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  if (args.scale === undefined) {
    return errorResult(
      'pinch_zoom requires a scale value (e.g. 0.5 to zoom out, 2.0 to zoom in).'
    );
  }
  const scale = args.scale;
  const velocity = args.velocity ?? DEFAULT_VELOCITY;

  if (!args.elementUUID && (args.x !== undefined) !== (args.y !== undefined)) {
    return errorResult(
      'pinch_zoom requires both x and y when using custom coordinates.'
    );
  }
  const useCustomCoords =
    !args.elementUUID && args.x !== undefined && args.y !== undefined;

  try {
    const platform = getPlatformName(driver);

    let cx: number;
    let cy: number;
    let spread: number;
    let windowRect: Awaited<ReturnType<typeof getWindowRect>> | null = null;

    if (args.elementUUID) {
      windowRect = await getWindowRect(driver);
      const rect = await getElementRect(driver, args.elementUUID);
      ({ cx, cy, spread } = resolveElementPinchTarget(rect, windowRect));
    } else if (useCustomCoords) {
      windowRect = await getWindowRect(driver);
      const target = resolveCoordinatePinchTarget(args.x!, args.y!, windowRect);
      if (typeof target === 'string') {
        return errorResult(target);
      }
      ({ cx, cy, spread } = target);
    } else {
      windowRect = await getWindowRect(driver);
      ({ cx, cy, spread } = resolveWindowPinchTarget(windowRect));
    }

    if (scale < 1) {
      // Zoom out: W3C Actions on all platforms; fingers move together.
      const startSpread = spread;
      const endSpread = Math.max(1, Math.floor(spread * scale));
      const duration = Math.floor((1 / Math.abs(velocity)) * 1000);

      await performActions(driver, [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: cx - startSpread, y: cy },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration, x: cx - endSpread, y: cy },
            { type: 'pointerUp', button: 0 },
          ],
        },
        {
          type: 'pointer',
          id: 'finger2',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: cx + startSpread, y: cy },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration, x: cx + endSpread, y: cy },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
    } else if (useCustomCoords && platform === PLATFORM.android) {
      // Zoom in at a custom center on Android: use the native pinchOpenGesture
      // with a region centered at (cx, cy). spread is pre-clamped so the region
      // fits within the window.
      const percent = Math.min(0.99, 1 - 1 / scale);
      await execute(driver, 'mobile: pinchOpenGesture', {
        left: cx - spread,
        top: cy - spread,
        width: 2 * spread,
        height: 2 * spread,
        percent,
      });
    } else if (useCustomCoords) {
      // Zoom in at a custom center on iOS using W3C Actions
      const startSpread = Math.max(1, Math.floor(spread / scale));
      const endSpread = spread;
      const duration = Math.floor((1 / Math.abs(velocity)) * 1000);

      await performActions(driver, [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: cx - startSpread, y: cy },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration, x: cx - endSpread, y: cy },
            { type: 'pointerUp', button: 0 },
          ],
        },
        {
          type: 'pointer',
          id: 'finger2',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: cx + startSpread, y: cy },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration, x: cx + endSpread, y: cy },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
    } else if (platform === PLATFORM.ios) {
      const params: Record<string, unknown> = {
        scale,
        velocity: Math.abs(velocity),
      };
      if (args.elementUUID) {
        params.elementId = args.elementUUID;
      }
      await execute(driver, 'mobile: pinch', params);
    } else if (platform === PLATFORM.android) {
      // Convert scale factor to percent (0-1) for pinchOpenGesture.
      // scale=2 -> 0.5, scale=4 -> 0.75, scale=10 -> 0.9. Capped at 0.99.
      const percent = Math.min(0.99, 1 - 1 / scale);
      const params: Record<string, unknown> = { percent };
      if (args.elementUUID) {
        params.elementId = args.elementUUID;
      } else {
        const rect = windowRect!;
        params.left = rect.x ?? 0;
        params.top = rect.y ?? 0;
        params.width = rect.width;
        params.height = rect.height;
      }
      await execute(driver, 'mobile: pinchOpenGesture', params);
    } else {
      return errorResult(
        `pinch_zoom is not supported on platform '${platform}'. Supported: iOS, Android.`
      );
    }

    const direction = scale < 1 ? 'out' : 'in';
    const target = args.elementUUID
      ? `element ${args.elementUUID}`
      : useCustomCoords
        ? `coordinates (${cx}, ${cy})`
        : 'screen';
    return textResult(
      `Successfully pinched ${direction} (scale=${scale}) on ${target}.`
    );
  } catch (err) {
    return errorResult(
      `Failed to perform pinch_zoom. ${toolErrorMessage(err)}`
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function maxSpreadForCenter(
  cx: number,
  cy: number,
  windowRect: RectLike
): number {
  const left = windowRect.x ?? 0;
  const top = windowRect.y ?? 0;
  const right = left + windowRect.width - 1;
  const bottom = top + windowRect.height - 1;

  return Math.max(1, Math.min(cx - left, right - cx, cy - top, bottom - cy));
}

function resolveWindowPinchTarget(windowRect: RectLike): PinchTarget {
  const cx = Math.floor((windowRect.x ?? 0) + windowRect.width / 2);
  const cy = Math.floor((windowRect.y ?? 0) + windowRect.height / 2);

  return {
    cx,
    cy,
    spread: Math.floor(
      Math.min(windowRect.width, windowRect.height) * DEFAULT_PINCH_SPREAD_RATIO
    ),
  };
}

function resolveCoordinatePinchTarget(
  x: number,
  y: number,
  windowRect: RectLike
): PinchTarget | string {
  const left = windowRect.x ?? 0;
  const top = windowRect.y ?? 0;
  const right = left + windowRect.width;
  const bottom = top + windowRect.height;

  if (x < left || x >= right || y < top || y >= bottom) {
    return `pinch_zoom coordinates (${x}, ${y}) are outside window bounds (${windowRect.width}x${windowRect.height}).`;
  }

  const desired = Math.floor(
    Math.min(windowRect.width, windowRect.height) * DEFAULT_PINCH_SPREAD_RATIO
  );

  return {
    cx: x,
    cy: y,
    spread: Math.min(desired, maxSpreadForCenter(x, y, windowRect)),
  };
}
