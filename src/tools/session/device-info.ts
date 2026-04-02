import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { execute } from '../../command.js';

export default function deviceInfo(server: FastMCP): void {
  server.addTool({
    name: 'appium_mobile_get_device_info',
    description:
      'Get device information such as model, manufacturer, OS version, screen density, locale, and more. Works on both iOS and Android.',
    parameters: z.object({
      sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: { sessionId?: string },
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
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
