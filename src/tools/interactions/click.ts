import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import { elementClick as _elementClick } from '../../command.js';

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
        await _elementClick(driver, args.elementUUID);
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
