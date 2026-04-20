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

const SWIPE_SPEED_PROFILES = {
  slow: { duration: 600, initialPause: 250 },
  normal: { duration: 300, initialPause: 200 },
  fast: { duration: 100, initialPause: 0 },
} as const;

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
      const rect = await getElementRect(driver, args.elementUUID);
      return coordsForDirection(args.direction, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
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

export async function handleScroll(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    const coordsResult = await resolveCoords(driver, args);
    if ('error' in coordsResult) {
      return errorResult(`scroll: ${coordsResult.error}`);
    }
    const coords = coordsResult;
    const duration = args.duration ?? SCROLL_DURATION_MS;
    const platform = getPlatformName(driver);

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
