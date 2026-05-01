import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../../session-store.js';
import { getPlatformName, PLATFORM } from '../../../session-store.js';
import {
  elementClick,
  execute,
  getElementRect,
  performActions,
} from '../../../command.js';
import {
  errorResult,
  textResult,
  textResultWithPrimaryElementId,
  toolErrorMessage,
} from '../../tool-response.js';
import { isAIEnabled } from '../../ai/config.js';
import type { GestureArgs } from '../schema.js';

const AI_ELEMENT_PREFIX = 'ai-element:';

const AI_DISABLED_REJECTION =
  `Received an ai-element: UUID, but the appium_ai tool is not registered ` +
  `(AI_VISION_ENABLED is not set to true). Use appium_find_element to get a real ` +
  `element UUID, or enable AI_VISION_ENABLED=true with the required AI_VISION_* keys.`;

export async function handleTap(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    if (args.elementUUID) {
      if (args.elementUUID.startsWith(AI_ELEMENT_PREFIX)) {
        if (!isAIEnabled()) {
          return errorResult(AI_DISABLED_REJECTION);
        }
        const parsed = parseAiElementCoords(args.elementUUID);
        if ('error' in parsed) {
          return errorResult(parsed.error);
        }
        await performActions(driver, w3cTapAt(parsed.x, parsed.y));
        return textResultWithPrimaryElementId(
          args.elementUUID,
          `Successfully tapped at AI element coordinates (${parsed.x}, ${parsed.y}).`
        );
      }
      await elementClick(driver, args.elementUUID);
      return textResultWithPrimaryElementId(
        args.elementUUID,
        `Successfully tapped element ${args.elementUUID}.`
      );
    }

    if (args.x === undefined || args.y === undefined) {
      return errorResult(
        'tap requires either elementUUID, or both x and y coordinates. ' +
          'Next: pass elementId from appium_find_element as elementUUID, or set both x and y.'
      );
    }
    await performActions(driver, w3cTapAt(args.x, args.y));
    return textResult(
      `Successfully tapped at coordinates (${args.x}, ${args.y}).`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to perform tap. ${toolErrorMessage(err)} ` +
        'Next: re-run appium_find_element if elementUUID may be stale, or retry after the UI settles.'
    );
  }
}

export async function handleDoubleTap(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    let x: number;
    let y: number;

    if (args.elementUUID) {
      const platform = getPlatformName(driver);
      if (platform === PLATFORM.ios) {
        await execute(driver, 'mobile: doubleTap', {
          elementId: args.elementUUID,
        });
        return textResultWithPrimaryElementId(
          args.elementUUID,
          `Successfully double tapped element ${args.elementUUID}.`
        );
      }
      const coords = await resolveCoordsFromElement(driver, args.elementUUID);
      x = coords.x;
      y = coords.y;
    } else if (args.x !== undefined && args.y !== undefined) {
      x = args.x;
      y = args.y;
    } else {
      return errorResult(
        'double_tap requires either elementUUID, or both x and y coordinates. ' +
          'Next: pass elementId from appium_find_element, or set both x and y.'
      );
    }

    await performActions(driver, [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 50 },
          { type: 'pointerUp', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 50 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    return textResult(`Successfully double tapped at (${x}, ${y}).`);
  } catch (err: unknown) {
    return errorResult(
      `Failed to perform double_tap. ${toolErrorMessage(err)} ` +
        'Next: re-run appium_find_element if the target moved, or retry on iOS with a visible element.'
    );
  }
}

export async function handleLongPress(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    const duration = args.duration ?? 2000;
    if (duration < 500 || duration > 10000) {
      return errorResult(
        'long_press duration must be between 500 and 10000 ms. Next: pass duration within that range or omit it for the default.'
      );
    }

    let x: number;
    let y: number;

    if (args.elementUUID) {
      const platform = getPlatformName(driver);
      if (platform === PLATFORM.ios) {
        try {
          await execute(driver, 'mobile: touchAndHold', {
            elementId: args.elementUUID,
            duration: duration / 1000,
          });
          return textResultWithPrimaryElementId(
            args.elementUUID,
            `Successfully long pressed element ${args.elementUUID} for ${duration}ms.`
          );
        } catch {
          // fall through to W3C Actions fallback
        }
      }
      const coords = await resolveCoordsFromElement(driver, args.elementUUID);
      x = coords.x;
      y = coords.y;
    } else if (args.x !== undefined && args.y !== undefined) {
      x = args.x;
      y = args.y;
    } else {
      return errorResult(
        'long_press requires either elementUUID, or both x and y coordinates. ' +
          'Next: pass elementId from appium_find_element, or set both x and y.'
      );
    }

    await performActions(driver, [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    return textResult(
      `Successfully long pressed at (${x}, ${y}) for ${duration}ms.`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to perform long_press. ${toolErrorMessage(err)} ` +
        'Next: ensure duration is 500–10000 ms, the element is visible, and retry if a system animation is running.'
    );
  }
}

function parseAiElementCoords(
  uuid: string
): { x: number; y: number } | { error: string } {
  const parts = uuid.split(':');
  if (parts.length < 2) {
    return {
      error:
        'Invalid AI element UUID format. Next: use the elementId line from appium_find_element (ai-element:x,y:...).',
    };
  }
  const coords = parts[1].split(',');
  if (coords.length < 2) {
    return {
      error:
        'Invalid AI element coordinates format. Next: call appium_find_element again and pass the returned ai-element token unchanged.',
    };
  }
  const x = parseInt(coords[0], 10);
  const y = parseInt(coords[1], 10);
  if (isNaN(x) || isNaN(y)) {
    return {
      error:
        'Invalid AI element coordinates: not numbers. Next: re-run appium_find_element to obtain a fresh ai-element id.',
    };
  }
  return { x, y };
}

function w3cTapAt(x: number, y: number) {
  return [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ];
}

async function resolveCoordsFromElement(
  driver: DriverInstance,
  elementUUID: string
): Promise<{ x: number; y: number }> {
  const rect = await getElementRect(driver, elementUUID);
  return {
    x: Math.floor(rect.x + rect.width / 2),
    y: Math.floor(rect.y + rect.height / 2),
  };
}
