import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, isRemoteDriverSession } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import type { Client } from 'webdriver';

export default function setValue(server: FastMCP): void {
  const setValueSchema = z.object({
    elementUUID: elementUUIDScheme,
    text: z.string().describe('The text to enter'),
  });

  server.addTool({
    name: 'appium_set_value',
    description: 'Enter text into an element',
    parameters: setValueSchema,
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
          ? await (driver as Client).elementSendKeys(
              args.elementUUID,
              args.text
            )
          : await (driver as any).setValue(args.text, args.elementUUID);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set value ${args.text} into element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to set value ${args.text} into element ${args.elementUUID}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
