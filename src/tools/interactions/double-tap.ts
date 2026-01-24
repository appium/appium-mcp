import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  PLATFORM,
} from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { Client } from 'webdriver';
import { execute, getElementRect, performActions } from '../../command.js';

export default function doubleTap(server: FastMCP): void {
  const doubleTapActionSchema = z.object({
    elementUUID: elementUUIDScheme,
  });

  server.addTool({
    name: 'appium_double_tap',
    description: 'Perform double tap on an element',
    parameters: doubleTapActionSchema,
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
        if (platform === PLATFORM.android) {
          // Get element location for Android double tap
          const element = await driver.findElement('id', args.elementUUID);
          const elementRect = await getElementRect(
            driver,
            element['element-6066-11e4-a52e-4f735466cecf']
          );

          // Calculate center coordinates
          const x = elementRect.x + elementRect.width / 2;
          const y = elementRect.y + elementRect.height / 2;

          // Perform double tap using performActions
          const operation = [
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
          ];
          await performActions(driver, operation);
        } else if (platform === PLATFORM.ios) {
          // Use iOS mobile: doubleTap execute method
          await execute(driver, 'mobile: doubleTap', {
            elementId: args.elementUUID,
          });
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully performed double tap on element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform double tap on element ${args.elementUUID}. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
