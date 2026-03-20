import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import {
  execute,
  getElementRect,
  getWindowRect,
  performActions,
} from '../../command.js';

export default function pinch(server: FastMCP): void {
  const pinchSchema = z.object({
    scale: z
      .number()
      .min(0.01)
      .max(10)
      .describe(
        'Pinch scale. Use a value between 0 and 1 to zoom out (pinch close), and a value greater than 1 to zoom in (pinch open). Example: 0.5 = zoom out 50%, 2.0 = zoom in 2x.'
      ),
    elementUUID: elementUUIDScheme
      .trim()
      .min(1)
      .optional()
      .describe(
        'Optional UUID of the element to pinch on. If not provided, the pinch gesture is applied to the whole screen.'
      ),
    velocity: z
      .number()
      .min(0.1)
      .max(20)
      .default(2.2)
      .optional()
      .describe(
        'The velocity of the pinch in scale factor per second. Used natively by iOS for zoom in, and controls gesture speed for zoom out on both platforms. Default is 2.2.'
      ),
  });

  server.addTool({
    name: 'appium_pinch',
    description:
      'Perform a pinch gesture to zoom in or zoom out. Use scale < 1 to zoom out (pinch close) and scale > 1 to zoom in (pinch open). Works on both iOS and Android. Optionally target a specific element, otherwise the gesture applies to the whole screen.',
    parameters: pinchSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof pinchSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
        const { scale, elementUUID, velocity = 2.2 } = args;
        const direction = scale < 1 ? 'close (zoom out)' : 'open (zoom in)';

        // Compute center and spread from element or full screen
        let cx: number, cy: number, spread: number;
        let windowRect: Awaited<ReturnType<typeof getWindowRect>> | null = null;
        if (elementUUID) {
          const rect = await getElementRect(driver, elementUUID);
          cx = Math.floor(rect.x + rect.width / 2);
          cy = Math.floor(rect.y + rect.height / 2);
          spread = Math.floor(Math.min(rect.width, rect.height) * 0.3);
        } else {
          windowRect = await getWindowRect(driver);
          cx = Math.floor(windowRect.width / 2);
          cy = Math.floor(windowRect.height / 2);
          spread = Math.floor(
            Math.min(windowRect.width, windowRect.height) * 0.3
          );
        }

        if (scale < 1) {
          // Zoom out on both platforms: W3C Actions, fingers start far, move close
          const startSpread = spread;
          const endSpread = Math.max(1, Math.floor(spread * scale));
          const duration = Math.floor((1 / Math.abs(velocity)) * 1000);

          await performActions(driver, [
            {
              type: 'pointer',
              id: 'finger1',
              parameters: { pointerType: 'touch' },
              actions: [
                {
                  type: 'pointerMove',
                  duration: 0,
                  x: cx - startSpread,
                  y: cy,
                },
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
                {
                  type: 'pointerMove',
                  duration: 0,
                  x: cx + startSpread,
                  y: cy,
                },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerMove', duration, x: cx + endSpread, y: cy },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ]);
        } else if (platform === PLATFORM.ios) {
          // Zoom in on iOS: mobile: pinch
          const params: Record<string, any> = {
            scale,
            velocity: Math.abs(velocity),
          };
          if (elementUUID) {
            params.elementId = elementUUID;
          }
          await execute(driver, 'mobile: pinch', params);
        } else if (platform === PLATFORM.android) {
          // Zoom in on Android: mobile: pinchOpenGesture
          // Convert scale factor to percent (0–1) for pinchOpenGesture:
          // scale=2 → 0.5, scale=4 → 0.75, scale=10 → 0.9. Capped at 0.99 to avoid edge collisions.
          const percent = Math.min(0.99, 1 - 1 / scale);
          const params: Record<string, any> = { percent };
          if (elementUUID) {
            params.elementId = elementUUID;
          } else {
            const rect = windowRect!;
            params.left = rect.x ?? 0;
            params.top = rect.y ?? 0;
            params.width = rect.width;
            params.height = rect.height;
          }
          await execute(driver, 'mobile: pinchOpenGesture', params);
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        const target = elementUUID ? `element ${elementUUID}` : 'screen';
        return {
          content: [
            {
              type: 'text',
              text: `Successfully performed pinch ${direction} (scale=${scale}) on ${target}.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform pinch gesture. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
