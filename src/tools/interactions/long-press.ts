import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { Client } from 'webdriver';

export default function longPress(server: FastMCP): void {
  const longPressSchema = z.object({
    elementUUID: elementUUIDScheme,
    duration: z
      .number()
      .int()
      .min(500)
      .max(10000)
      .default(2000)
      .optional()
      .describe(
        'Duration of the long press in milliseconds. Default is 2000ms.'
      ),
  });

  server.addTool({
    name: 'appium_long_press',
    description: 'Perform a long press (press and hold) gesture on an element',
    parameters: longPressSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
        const duration = args.duration || 2000;

        if (platform === PLATFORM.android) {
          const rect = isAndroidUiautomator2DriverSession(driver)
            ? await driver.getElementRect(args.elementUUID)
            : await (driver as Client).getElementRect(args.elementUUID);
          const x = Math.floor(rect.x + rect.width / 2);
          const y = Math.floor(rect.y + rect.height / 2);

          const operation = [
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
          ];
          const _ok = isAndroidUiautomator2DriverSession(driver)
            ? await driver.performActions(operation)
            : await (driver as Client).performActions(operation);
        } else if (platform === 'iOS') {
          try {
            const _ok = isXCUITestDriverSession(driver)
              ? await driver.execute('mobile: touchAndHold', {
                  elementId: args.elementUUID,
                  duration: duration / 1000,
                })
              : await (driver as Client).executeScript('mobile: touchAndHold', [
                  {
                    elementId: args.elementUUID,
                    duration: duration / 1000,
                  },
                ]);
          } catch (touchAndHoldError) {
            const rect = isXCUITestDriverSession(driver)
              ? await driver.getElementRect(args.elementUUID)
              : await (driver as Client).getElementRect(args.elementUUID);
            const x = Math.floor(rect.x + rect.width / 2);
            const y = Math.floor(rect.y + rect.height / 2);

            const operation = [
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
            ];
            const _ok = isXCUITestDriverSession(driver)
              ? await driver.performActions(
                  operation as import('@appium/types').ActionSequence[]
                )
              : await (driver as Client).performActions(operation);
          }
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully performed long press on element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform long press on element ${args.elementUUID}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
