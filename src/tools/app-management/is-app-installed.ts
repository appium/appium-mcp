import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import { resolveAppId } from './resolve-app-id.js';

export default function isAppInstalled(server: FastMCP): void {
  const schema = z.object({
    id: z
      .string()
      .optional()
      .describe(
        'App identifier (package name for Android, bundle ID for iOS). Takes precedence over name.'
      ),
    name: z
      .string()
      .optional()
      .describe(
        'Human-readable app name (e.g. "Spotify"). Used to resolve the app id when id is not provided.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_is_app_installed',
    description:
      'Check whether an app is installed. Package name for Android, bundle ID for iOS.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ) => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }
      let id = args.id;
      if (!id) {
        if (!args.name) {
          throw new Error('Either id or name must be provided');
        }
        id = await resolveAppId(args.name, args.sessionId);
      }
      try {
        let result: boolean;
        if (isRemoteDriverSession(driver)) {
          const platform = getPlatformName(driver);
          const params =
            platform === PLATFORM.android ? { appId: id } : { bundleId: id };
          const raw = await execute(driver, 'mobile: isAppInstalled', params);
          result = Boolean(raw);
        } else if (isXCUITestDriverSession(driver)) {
          result = await (driver as XCUITestDriver).isAppInstalled(id);
        } else if (isAndroidUiautomator2DriverSession(driver)) {
          result = await (
            driver as AndroidUiautomator2Driver
          ).adb.isAppInstalled(id);
        } else {
          throw new Error('Unsupported driver for isAppInstalled');
        }
        return {
          content: [
            {
              type: 'text',
              text: result
                ? `App "${id}" is installed.`
                : `App "${id}" is not installed.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to check if app is installed. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
