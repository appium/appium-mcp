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

  try {
    const platform = getPlatformName(driver);

    let cx: number;
    let cy: number;
    let spread: number;
    let windowRect: Awaited<ReturnType<typeof getWindowRect>> | null = null;

    if (args.elementUUID) {
      const rect = await getElementRect(driver, args.elementUUID);
      cx = Math.floor(rect.x + rect.width / 2);
      cy = Math.floor(rect.y + rect.height / 2);
      spread = Math.floor(Math.min(rect.width, rect.height) * 0.3);
    } else {
      windowRect = await getWindowRect(driver);
      cx = Math.floor(windowRect.width / 2);
      cy = Math.floor(windowRect.height / 2);
      spread = Math.floor(Math.min(windowRect.width, windowRect.height) * 0.3);
    }

    if (scale < 1) {
      // Zoom out: two fingers move from spread apart to close together. W3C Actions on both platforms.
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
      // Convert scale factor to percent (0–1) for pinchOpenGesture.
      // scale=2 → 0.5, scale=4 → 0.75, scale=10 → 0.9. Capped at 0.99.
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
    const target = args.elementUUID ? `element ${args.elementUUID}` : 'screen';
    return textResult(
      `Successfully pinched ${direction} (scale=${scale}) on ${target}.`
    );
  } catch (err) {
    return errorResult(
      `Failed to perform pinch_zoom. ${toolErrorMessage(err)}`
    );
  }
}
