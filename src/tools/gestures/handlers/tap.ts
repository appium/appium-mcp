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
import {
  aiDisabledResult,
  isAiElementUUID,
  parseAiElement,
} from './ai-element.js';
import type { GestureArgs } from '../schema.js';

export async function handleTap(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    if (args.elementUUID) {
      if (isAiElementUUID(args.elementUUID)) {
        if (!isAIEnabled()) {
          return aiDisabledResult();
        }
        const parsed = parseAiElement(args.elementUUID);
        if ('error' in parsed) {
          return errorResult(parsed.error);
        }
        const { x, y } = parsed.center;
        await performActions(driver, w3cTapAt(x, y));
        return textResultWithPrimaryElementId(
          args.elementUUID,
          `Successfully tapped at AI element coordinates (${x}, ${y}).`
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
        'tap requires either elementUUID, or both x and y coordinates.'
      );
    }
    await performActions(driver, w3cTapAt(args.x, args.y));
    return textResult(
      `Successfully tapped at coordinates (${args.x}, ${args.y}).`
    );
  } catch (err: unknown) {
    return errorResult(`Failed to perform tap. ${toolErrorMessage(err)}`);
  }
}

export async function handleDoubleTap(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  try {
    let x: number;
    let y: number;

    // The XCUITest native `mobile: doubleTap` recognizer doesn't reliably
    // surface as two distinct touch sequences to React Native (and likely
    // other JS-bridged) gesture handlers. Resolve elements to coordinates
    // and use the same W3C sequence everywhere, verified against vodqa.
    if (args.elementUUID) {
      if (isAiElementUUID(args.elementUUID)) {
        if (!isAIEnabled()) {
          return aiDisabledResult();
        }
        const parsed = parseAiElement(args.elementUUID);
        if ('error' in parsed) {
          return errorResult(parsed.error);
        }
        // ai-element UUIDs are coordinates, not real element ids — use W3C
        // double-tap at the parsed centre (same as main for real elements).
        ({ x, y } = parsed.center);
      } else {
        const coords = await resolveCoordsFromElement(driver, args.elementUUID);
        x = coords.x;
        y = coords.y;
      }
    } else if (args.x !== undefined && args.y !== undefined) {
      x = args.x;
      y = args.y;
    } else {
      return errorResult(
        'double_tap requires either elementUUID, or both x and y coordinates.'
      );
    }

    await performActions(driver, [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 10, x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    return textResult(`Successfully double tapped at (${x}, ${y}).`);
  } catch (err: unknown) {
    return errorResult(
      `Failed to perform double_tap. ${toolErrorMessage(err)}`
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
        'long_press duration must be between 500 and 10000 ms.'
      );
    }

    let x: number;
    let y: number;

    if (args.elementUUID) {
      if (isAiElementUUID(args.elementUUID)) {
        if (!isAIEnabled()) {
          return aiDisabledResult();
        }
        const parsed = parseAiElement(args.elementUUID);
        if ('error' in parsed) {
          return errorResult(parsed.error);
        }
        // ai-element UUIDs are coordinates, not real element ids — skip the
        // iOS `mobile: touchAndHold` fast-path and long-press at the parsed centre.
        ({ x, y } = parsed.center);
      } else {
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
      }
    } else if (args.x !== undefined && args.y !== undefined) {
      x = args.x;
      y = args.y;
    } else {
      return errorResult(
        'long_press requires either elementUUID, or both x and y coordinates.'
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
      `Failed to perform long_press. ${toolErrorMessage(err)}`
    );
  }
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
