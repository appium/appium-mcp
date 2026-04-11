import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';

export default function openNotifications(server: FastMCP): void {
  const schema = z.object({
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_mobile_open_notifications',
    description:
      'Open the Android notifications panel using the mobile: openNotifications extension. Does nothing if the panel is already open.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      const platform = getPlatformName(driver);
      if (platform !== PLATFORM.android) {
        return {
          content: [
            {
              type: 'text',
              text: `Unsupported platform: ${platform}. Open notifications is supported on Android only.`,
            },
          ],
        };
      }

      try {
        if (isAndroidUiautomator2DriverSession(driver)) {
          await (driver as AndroidUiautomator2Driver).openNotifications();
        } else if (isRemoteDriverSession(driver)) {
          await execute(driver, 'mobile: openNotifications', {});
        } else {
          throw new Error('Unsupported Android driver for open notifications');
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Successfully opened notifications panel.',
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to open notifications panel. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
