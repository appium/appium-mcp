import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import log from '../../logger.js';
import { elementUUIDScheme } from '../../schema.js';
import {
  execute,
  getElementRect,
  getWindowRect,
  performActions,
} from '../../command.js';

function calculateSwipeCoordinates(
  direction: 'left' | 'right' | 'up' | 'down',
  width: number,
  height: number
): { startX: number; startY: number; endX: number; endY: number } {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  switch (direction) {
    case 'left':
      return {
        startX: Math.floor(width * 0.8),
        startY: centerY,
        endX: Math.floor(width * 0.2),
        endY: centerY,
      };
    case 'right':
      return {
        startX: Math.floor(width * 0.2),
        startY: centerY,
        endX: Math.floor(width * 0.8),
        endY: centerY,
      };
    case 'up':
      return {
        startX: centerX,
        startY: Math.floor(height * 0.8),
        endX: centerX,
        endY: Math.floor(height * 0.2),
      };
    case 'down':
      return {
        startX: centerX,
        startY: Math.floor(height * 0.2),
        endX: centerX,
        endY: Math.floor(height * 0.8),
      };
    default:
      throw new Error(`Invalid direction: ${direction}`);
  }
}

async function performAndroidSwipe(
  driver: any,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number
): Promise<void> {
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 250 },
        { type: 'pointerMove', duration, x: endX, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
}

async function performiOSSwipe(
  driver: any,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number
): Promise<void> {
  try {
    await execute(driver, 'mobile: dragFromToForDuration', {
      fromX: startX,
      fromY: startY,
      toX: endX,
      toY: endY,
      duration: duration / 1000,
    });
    log.info('iOS swipe completed using mobile: dragFromToForDuration');
  } catch (dragError) {
    log.info('mobile: dragFromToForDuration failed, trying performActions');
    await driver.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: startX, y: startY },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 200 },
          { type: 'pointerMove', duration, x: endX, y: endY },
          { type: 'pause', duration: 50 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    log.info('iOS swipe completed using performActions');
  }
}

export default function swipe(server: any): void {
  server.addTool({
    name: 'appium_swipe',
    description: `Swipe on the current screen in a specified direction or between custom coordinates.
      Supports four directions: left, right, up, down.
      Can also perform custom coordinate-based swipes for precise control.
      This is useful for navigating carousels, switching tabs, dismissing elements, or navigating between screens.`,
    parameters: z.object({
      direction: z
        .enum(['left', 'right', 'up', 'down'])
        .optional()
        .describe(
          'Direction to swipe. If provided, coordinates will be calculated automatically based on screen size or, when elementUUID is set, relative to that element. Either direction OR custom coordinates must be provided.'
        ),
      elementUUID: elementUUIDScheme
        .optional()
        .describe(
          'Optional element to base the swipe on. When provided with direction, the swipe is calculated relative to this element instead of the whole screen.'
        ),
      startX: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Starting X coordinate for custom swipe. Required if direction is not provided.'
        ),
      startY: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Starting Y coordinate for custom swipe. Required if direction is not provided.'
        ),
      endX: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Ending X coordinate for custom swipe. Required if direction is not provided.'
        ),
      endY: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Ending Y coordinate for custom swipe. Required if direction is not provided.'
        ),
      duration: z
        .number()
        .int()
        .min(0)
        .max(5000)
        .default(600)
        .optional()
        .describe(
          'Duration of the swipe gesture in milliseconds. Default is 600ms. Higher values create slower swipes.'
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error(
          'No active driver session. Please create a session first.'
        );
      }

      try {
        const platform = getPlatformName(driver);
        let startX: number, startY: number, endX: number, endY: number;

        if (args.direction) {
          if (args.elementUUID) {
            const rect = await getElementRect(driver, args.elementUUID);
            const elementCenterX = Math.floor(rect.x + rect.width / 2);
            const elementCenterY = Math.floor(rect.y + rect.height / 2);

            switch (args.direction) {
              case 'left':
                startX = Math.floor(rect.x + rect.width * 0.8);
                startY = elementCenterY;
                endX = Math.floor(rect.x + rect.width * 0.2);
                endY = elementCenterY;
                break;
              case 'right':
                startX = Math.floor(rect.x + rect.width * 0.2);
                startY = elementCenterY;
                endX = Math.floor(rect.x + rect.width * 0.8);
                endY = elementCenterY;
                break;
              case 'up':
                startX = elementCenterX;
                startY = Math.floor(rect.y + rect.height * 0.8);
                endX = elementCenterX;
                endY = Math.floor(rect.y + rect.height * 0.2);
                break;
              case 'down':
                startX = elementCenterX;
                startY = Math.floor(rect.y + rect.height * 0.2);
                endX = elementCenterX;
                endY = Math.floor(rect.y + rect.height * 0.8);
                break;
              default:
                throw new Error(`Invalid direction: ${args.direction}`);
            }
            log.info('Calculated element-based swipe coordinates:', {
              elementUUID: args.elementUUID,
              startX,
              startY,
              endX,
              endY,
            });
          } else {
            const { width, height } = await getWindowRect(driver);
            log.info('Device screen size:', { width, height });
            const coords = calculateSwipeCoordinates(
              args.direction,
              width,
              height
            );
            startX = coords.startX;
            startY = coords.startY;
            endX = coords.endX;
            endY = coords.endY;
          }
        } else if (
          args.startX !== undefined &&
          args.startY !== undefined &&
          args.endX !== undefined &&
          args.endY !== undefined
        ) {
          startX = args.startX;
          startY = args.startY;
          endX = args.endX;
          endY = args.endY;
        } else {
          throw new Error(
            'Either direction or all custom coordinates (startX, startY, endX, endY) must be provided.'
          );
        }

        const duration = args.duration || 600;

        log.info('Swipe coordinates:', {
          startX,
          startY,
          endX,
          endY,
          duration,
        });

        if (platform === PLATFORM.android) {
          if (startX !== endX && Math.abs(startY - endY) < 50) {
            const swipeDuration = Math.min(duration, 400);
            const operation = [
              {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                  { type: 'pointerMove', duration: 0, x: startX, y: startY },
                  { type: 'pointerDown', button: 0 },
                  { type: 'pause', duration: 200 },
                  {
                    type: 'pointerMove',
                    duration: swipeDuration,
                    x: endX,
                    y: endY,
                  },
                  { type: 'pause', duration: 50 },
                  { type: 'pointerUp', button: 0 },
                ],
              },
            ];
            await performActions(driver, operation);
            log.info('Android horizontal swipe completed');
          } else {
            await performAndroidSwipe(
              driver,
              startX,
              startY,
              endX,
              endY,
              duration
            );
          }
          log.info('Android swipe action completed successfully.');
        } else if (platform === PLATFORM.ios) {
          if (args.direction) {
            try {
              await execute(driver, 'mobile: swipe', {
                direction: args.direction,
              });
              log.info(
                `iOS swipe completed using mobile: swipe (${args.direction})`
              );
            } catch (swipeError) {
              log.info('mobile: swipe failed, trying dragFromToForDuration');
              await performiOSSwipe(
                driver,
                startX,
                startY,
                endX,
                endY,
                duration
              );
            }
          } else {
            await performiOSSwipe(driver, startX, startY, endX, endY, duration);
          }
          log.info('iOS swipe action completed successfully.');
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        const directionText = args.direction
          ? ` ${args.direction}`
          : ` from (${startX}, ${startY}) to (${endX}, ${endY})`;

        return {
          content: [
            {
              type: 'text',
              text: `Swiped${directionText} successfully.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform swipe. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
