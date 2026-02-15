import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { getOrientation as _getOrientation } from '../../command.js';

export default function getOrientation(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_orientation',
    description:
      'Get the current device/screen orientation. Returns LANDSCAPE or PORTRAIT.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const orientation = await _getOrientation(driver);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully got orientation: ${orientation}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get orientation. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
