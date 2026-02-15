import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import {
  getOrientation as _getOrientation,
  setOrientation as _setOrientation,
} from '../../command.js';

export function getOrientation(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_orientation',
    description:
      'Get the current device/screen orientation. Returns LANDSCAPE or PORTRAIT.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (_args: any, _context: any): Promise<any> => {
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

const setOrientationSchema = z.object({
  orientation: z
    .enum(['LANDSCAPE', 'PORTRAIT'])
    .describe('Target orientation: LANDSCAPE or PORTRAIT'),
});

export function setOrientation(server: FastMCP): void {
  server.addTool({
    name: 'appium_set_orientation',
    description:
      'Set the device/screen orientation to LANDSCAPE or PORTRAIT. Works for both Android and iOS sessions.',
    parameters: setOrientationSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, _context: any): Promise<any> => {
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
