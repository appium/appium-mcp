import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../../session-store.js';
import { getPlatformName, PLATFORM } from '../../../session-store.js';
import { execute, getWindowRect, performActions } from '../../../command.js';
import {
  errorResult,
  textResult,
  toolErrorMessage,
} from '../../tool-response.js';
import { isAIEnabled } from '../../ai/config.js';
import {
  aiDisabledResult,
  isAiElementUUID,
  resolveTargetRect,
} from './ai-element.js';
import type { GestureArgs } from '../schema.js';

type Direction = 'up' | 'down' | 'left' | 'right';
type Coords = { startX: number; startY: number; endX: number; endY: number };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCROLL_DURATION_MS = 800;
const SCROLL_INITIAL_PAUSE_MS = 250;
/** Pointer move duration for programmatic vertical scroll (matches legacy appium_scroll). */
const VERTICAL_SCROLL_MOVE_MS = 600;

export type VerticalScrollOptions = {
  direction: 'up' | 'down';
  distance: number;
};

/**
 * Vertical swipe in the middle of the window, scaled by `distance` (0.05–1).
 * Used by `appium_gesture` `scroll_to_element`; matches legacy scroll distances.
 */
export async function performVerticalScroll(
  driver: DriverInstance,
  options: VerticalScrollOptions
): Promise<void> {
  const rect = await getWindowRect(driver);
  const { width, height } = rect;
  const startX = Math.floor(width / 2);
  const { startY, endY } = verticalScrollYs(
    height,
    options.direction,
    options.distance
  );

  if (getPlatformName(driver) === PLATFORM.android) {
    await performActions(driver, [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: startX, y: startY },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: SCROLL_INITIAL_PAUSE_MS },
          {
            type: 'pointerMove',
            duration: VERTICAL_SCROLL_MOVE_MS,
            x: startX,
            y: endY,
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
  } else if (getPlatformName(driver) === PLATFORM.ios) {
    await execute(driver, 'mobile: scroll', {
      direction: options.direction,
      startX,
      startY,
      endX: startX,
      endY,
    });
  } else {
    throw new Error(
      `Unsupported platform: ${getPlatformName(driver)}. Only Android and iOS are supported.`
    );
  }
}

function verticalScrollYs(
  height: number,
  direction: 'up' | 'down',
  distance: number
): { startY: number; endY: number } {
  const mid = height * 0.5;
  const halfSpan = height * 0.3 * distance;
  if (direction === 'down') {
    return {
      startY: Math.floor(mid + halfSpan),
      endY: Math.floor(mid - halfSpan),
    };
  }
  return {
    startY: Math.floor(mid - halfSpan),
    endY: Math.floor(mid + halfSpan),
  };
}

const SWIPE_SPEED_PROFILES = {
  slow: { duration: 600, initialPause: 250 },
  normal: { duration: 300, initialPause: 200 },
  fast: { duration: 100, initialPause: 0 },
} as const;

const FLIPPED_DIRECTION: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export async function handleScroll(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    if (isAiElementUUID(args.elementUUID) && !isAIEnabled()) {
      return aiDisabledResult();
    }
    const platform = getPlatformName(driver);
    // Android scroll follows the scrollbar convention (down = reveal content below),
    // so flip the user's direction before computing the W3C drag coords.
    const coordsArgs =
      platform === PLATFORM.android && args.direction
        ? { ...args, direction: FLIPPED_DIRECTION[args.direction] }
        : args;
    const coordsResult = await resolveCoords(driver, coordsArgs);
    if ('error' in coordsResult) {
      return errorResult(`scroll: ${coordsResult.error}`);
    }
    const coords = coordsResult;
    const duration = args.duration ?? SCROLL_DURATION_MS;

    if (platform === PLATFORM.ios && args.direction && !args.elementUUID) {
      await execute(driver, 'mobile: scroll', {
        direction: args.direction,
        startX: coords.startX,
        startY: coords.startY,
        endX: coords.endX,
        endY: coords.endY,
      });
    } else {
      await performW3CDrag(driver, coords, duration, SCROLL_INITIAL_PAUSE_MS);
    }

    return textResult(
      args.direction
        ? `Successfully scrolled ${args.direction}.`
        : `Successfully scrolled from (${coords.startX}, ${coords.startY}) to (${coords.endX}, ${coords.endY}).`
    );
  } catch (err) {
    return errorResult(`Failed to scroll. ${toolErrorMessage(err)}`);
  }
}

export async function handleSwipe(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    if (isAiElementUUID(args.elementUUID) && !isAIEnabled()) {
      return aiDisabledResult();
    }
    const coordsResult = await resolveCoords(driver, args);
    if ('error' in coordsResult) {
      return errorResult(`swipe: ${coordsResult.error}`);
    }
    const coords = coordsResult;
    const speed = args.speed ?? 'normal';
    const profile = SWIPE_SPEED_PROFILES[speed];
    const duration = args.duration ?? profile.duration;
    const initialPause = profile.initialPause;
    const platform = getPlatformName(driver);

    // speed=fast preserves raw-velocity behavior (pull-to-refresh etc.) — skip iOS native paths.
    if (
      platform === PLATFORM.ios &&
      args.direction &&
      !args.elementUUID &&
      speed !== 'fast'
    ) {
      try {
        await execute(driver, 'mobile: swipe', { direction: args.direction });
      } catch {
        try {
          await execute(driver, 'mobile: dragFromToForDuration', {
            fromX: coords.startX,
            fromY: coords.startY,
            toX: coords.endX,
            toY: coords.endY,
            duration: duration / 1000,
          });
        } catch {
          await performW3CDrag(driver, coords, duration, initialPause);
        }
      }
    } else {
      await performW3CDrag(driver, coords, duration, initialPause);
    }

    return textResult(
      args.direction
        ? `Successfully swiped ${args.direction} (speed=${speed}).`
        : `Successfully swiped from (${coords.startX}, ${coords.startY}) to (${coords.endX}, ${coords.endY}) (speed=${speed}).`
    );
  } catch (err) {
    return errorResult(`Failed to swipe. ${toolErrorMessage(err)}`);
  }
}

/**
 * Clip an element rect to the visible window. Used for ai-element targets whose
 * bbox or fallback rect can extend past the screenshot edges.
 */
export function rectVisibleWithinWindow(elementRect: Rect, window: Rect): Rect {
  const windowLeft = window.x ?? 0;
  const windowTop = window.y ?? 0;
  const windowRight = windowLeft + window.width;
  const windowBottom = windowTop + window.height;

  const visibleLeft = Math.max(windowLeft, elementRect.x);
  const visibleTop = Math.max(windowTop, elementRect.y);
  const visibleRight = Math.min(windowRight, elementRect.x + elementRect.width);
  const visibleBottom = Math.min(
    windowBottom,
    elementRect.y + elementRect.height
  );

  const width = Math.max(0, visibleRight - visibleLeft);
  const height = Math.max(0, visibleBottom - visibleTop);

  if (width > 0 && height > 0) {
    return { x: visibleLeft, y: visibleTop, width, height };
  }

  const cx = elementRect.x + elementRect.width / 2;
  const cy = elementRect.y + elementRect.height / 2;
  return {
    x: Math.floor(clamp(cx, windowLeft, windowRight - 1)),
    y: Math.floor(clamp(cy, windowTop, windowBottom - 1)),
    width: 1,
    height: 1,
  };
}

/** Keep swipe/scroll pointer coords inside the window (inclusive pixel indices). */
export function clampDirectionCoordsToWindow(
  coords: Coords,
  window: { width: number; height: number }
): Coords {
  const maxX = Math.max(0, window.width - 1);
  const maxY = Math.max(0, window.height - 1);
  return {
    startX: Math.floor(clamp(coords.startX, 0, maxX)),
    startY: Math.floor(clamp(coords.startY, 0, maxY)),
    endX: Math.floor(clamp(coords.endX, 0, maxX)),
    endY: Math.floor(clamp(coords.endY, 0, maxY)),
  };
}

function coordsForDirection(direction: Direction, rect: Rect): Coords {
  const centerX = Math.floor(rect.x + rect.width / 2);
  const centerY = Math.floor(rect.y + rect.height / 2);
  switch (direction) {
    case 'left':
      return {
        startX: Math.floor(rect.x + rect.width * 0.8),
        startY: centerY,
        endX: Math.floor(rect.x + rect.width * 0.2),
        endY: centerY,
      };
    case 'right':
      return {
        startX: Math.floor(rect.x + rect.width * 0.2),
        startY: centerY,
        endX: Math.floor(rect.x + rect.width * 0.8),
        endY: centerY,
      };
    case 'up':
      return {
        startX: centerX,
        startY: Math.floor(rect.y + rect.height * 0.8),
        endX: centerX,
        endY: Math.floor(rect.y + rect.height * 0.2),
      };
    case 'down':
      return {
        startX: centerX,
        startY: Math.floor(rect.y + rect.height * 0.2),
        endX: centerX,
        endY: Math.floor(rect.y + rect.height * 0.8),
      };
  }
}

async function resolveCoords(
  driver: DriverInstance,
  args: GestureArgs
): Promise<Coords | { error: string }> {
  if (args.direction) {
    if (args.elementUUID) {
      // ai-element UUIDs are coordinate UUIDs, not real element ids; their
      // rect is synthesised from the bbox in the UUID itself rather than
      // fetched from the driver.
      const rect = await resolveTargetRect(driver, args.elementUUID);
      if ('error' in rect) {
        return rect;
      }
      const targetRect: Rect = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      if (!isAiElementUUID(args.elementUUID)) {
        return coordsForDirection(args.direction, targetRect);
      }
      const window = await getWindowRect(driver);
      const clippedRect = rectVisibleWithinWindow(targetRect, {
        x: 0,
        y: 0,
        width: window.width,
        height: window.height,
      });
      const coords = coordsForDirection(args.direction, clippedRect);
      return clampDirectionCoordsToWindow(coords, window);
    }
    const window = await getWindowRect(driver);
    return coordsForDirection(args.direction, {
      x: 0,
      y: 0,
      width: window.width,
      height: window.height,
    });
  }

  if (
    args.x !== undefined &&
    args.y !== undefined &&
    args.endX !== undefined &&
    args.endY !== undefined
  ) {
    return { startX: args.x, startY: args.y, endX: args.endX, endY: args.endY };
  }

  return {
    error:
      'Either direction OR custom coordinates (x, y, endX, endY) must be provided.',
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function performW3CDrag(
  driver: DriverInstance,
  coords: Coords,
  duration: number,
  initialPause: number
): Promise<void> {
  const actions = [
    { type: 'pointerMove', duration: 0, x: coords.startX, y: coords.startY },
    { type: 'pointerDown', button: 0 },
    ...(initialPause > 0 ? [{ type: 'pause', duration: initialPause }] : []),
    { type: 'pointerMove', duration, x: coords.endX, y: coords.endY },
    { type: 'pointerUp', button: 0 },
  ];
  await performActions(driver, [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions,
    },
  ]);
}
