import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { setOrientation as _setOrientation } from '../../command.js';

const setOrientationSchema = z.object({
  orientation: z
    .enum(['LANDSCAPE', 'PORTRAIT'])
    .describe('Target orientation: LANDSCAPE or PORTRAIT'),
});

export default function setOrientation(server: FastMCP): void {
  server.addTool({
    name: 'appium_set_orientation',
    description:
      'Set the device/screen orientation to LANDSCAPE or PORTRAIT. Works for both Android and iOS sessions.',
    parameters: setOrientationSchema,
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
        await _setOrientation(driver, args.orientation);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set orientation to ${args.orientation}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to set orientation to ${args.orientation}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
