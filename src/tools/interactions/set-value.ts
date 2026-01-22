import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import { setValue as _setValue } from '../../command.js';

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
        await _setValue(driver, args.elementUUID, args.text);
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
