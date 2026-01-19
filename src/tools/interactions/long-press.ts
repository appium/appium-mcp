import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
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

        if (platform === 'Android') {
          const rect = await (driver as any).getElementRect(args.elementUUID);
          const x = Math.floor(rect.x + rect.width / 2);
          const y = Math.floor(rect.y + rect.height / 2);

          await (driver as any).performActions([
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
        } else if (platform === 'iOS') {
          try {
            const _ok = isRemoteDriverSession(driver)
              ? await (driver as Client).executeScript('mobile: touchAndHold', [
                  {
                    elementId: args.elementUUID,
                    duration: duration / 1000,
                  },
                ])
              : await (driver as any).execute('mobile: touchAndHold', {
                  elementId: args.elementUUID,
                  duration: duration / 1000,
                });
          } catch (touchAndHoldError) {
            const rect = await (driver as any).getElementRect(args.elementUUID);
            const x = Math.floor(rect.x + rect.width / 2);
            const y = Math.floor(rect.y + rect.height / 2);

            await (driver as any).performActions([
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
