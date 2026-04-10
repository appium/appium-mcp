import type { ContentResult, FastMCP } from 'fastmcp';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';

const deviceControlSchema = z.object({
  action: z
    .enum(['lock', 'unlock', 'shake', 'open_notifications'])
    .describe(
      'Action to perform: lock/unlock device, shake (iOS XCUITest only), or open notifications (Android only).'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
  seconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Only for action=lock: lock duration in seconds before auto-unlock. Omit to remain locked until unlock.'
    ),
});

export default function mobileDeviceControl(server: FastMCP): void {
  server.addTool({
    name: 'appium_mobile_device_control',
    description:
      'Control device-level actions in one tool. action=lock|unlock uses mobile: lock/unlock, action=shake performs iOS XCUITest shake, action=open_notifications opens Android notifications panel.',
    parameters: deviceControlSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof deviceControlSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        const driver = getDriver(args.sessionId);
        if (!driver) {
          throw new Error('No driver found');
        }

        if (args.action !== 'lock' && args.seconds !== undefined) {
          throw new Error('seconds is only valid when action is lock');
        }

        if (args.action === 'lock') {
          const params: { seconds?: number } = {};
          if (args.seconds !== undefined) {
            params.seconds = args.seconds;
          }
          await execute(driver, 'mobile: lock', params);
          const msg =
            args.seconds !== undefined
              ? `Device locked for ${args.seconds} second(s).`
              : 'Device locked.';
          return {
            content: [{ type: 'text', text: msg }],
          };
        }

        if (args.action === 'unlock') {
          await execute(driver, 'mobile: unlock', {});
          return {
            content: [{ type: 'text', text: 'Device unlocked.' }],
          };
        }

        if (args.action === 'shake') {
          if (!isXCUITestDriverSession(driver)) {
            throw new Error(
              'Shake is supported only with XCUITest driver sessions.'
            );
          }
          await (driver as any).mobileShake();
          return {
            content: [{ type: 'text', text: 'Shake action performed.' }],
          };
        }

        const platform = getPlatformName(driver);
        if (platform !== PLATFORM.android) {
          throw new Error(
            `Unsupported platform: ${platform}. Open notifications is supported on Android only.`
          );
        }

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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed device control action ${args.action}. err: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
