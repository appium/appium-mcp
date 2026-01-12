import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, isRemoteDriverSession } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { Client } from 'webdriver';

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
        const _ok = isRemoteDriverSession(driver)
          ? await (driver as Client).elementClick(args.elementUUID)
          : await (driver as any).click(args.elementUUID);
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
