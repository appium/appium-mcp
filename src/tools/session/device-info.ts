import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

export default function deviceInfo(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_device_info',
    description:
      'Get device information such as model, manufacturer, OS version, screen density, locale, and more. Works on both iOS and Android.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      _args: Record<string, never>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const result = await execute(driver, 'mobile: deviceInfo', {});

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get device info. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
