import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, isAndroidUiautomator2DriverSession, isRemoteDriverSession } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { Client } from 'webdriver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';

export default function generateTest(server: FastMCP): void {
  const clickActionSchema = z.object({
    elementUUID: elementUUIDScheme,
  });

  server.addTool({
    name: 'appium_click',
    description: 'Click on an element',
    parameters: clickActionSchema,
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
        const elementClick = async () => {
          isAndroidUiautomator2DriverSession(driver)
          ? await driver.click(args.elementUUID)
          : await (driver as XCUITestDriver).click(args.elementUUID)

        }
        const _ok = isRemoteDriverSession(driver)
          ? await (driver as Client).elementClick(args.elementUUID)
          : await elementClick();
        return {
          content: [
            {
              type: 'text',
              text: `Successfully clicked on element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to click on element ${args.elementUUID}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
