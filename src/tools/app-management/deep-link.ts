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

export default function deepLink(server: FastMCP): void {
  const schema = z.object({
    url: z
      .string()
      .describe(
        'Deep link URL to open (e.g. https://example.com, myapp://path)'
      ),
    appId: z
      .string()
      .optional()
      .describe('App identifier: bundleId (iOS) or package (Android)'),
    waitForLaunch: z
      .boolean()
      .optional()
      .describe(
        'Android only. If false, ADB does not wait for the activity to return control. Defaults to true.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_deep_link',
    description:
      'Open a deep link URL with the default or specified app. Supported on Android and iOS.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { url, appId, waitForLaunch } = args;
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }
      try {
        if (isRemoteDriverSession(driver)) {
          const platform = getPlatformName(driver);
          if (platform === PLATFORM.android) {
            const params: Record<string, unknown> = { url };
            if (appId != null) {
              params.package = appId;
            }
            if (waitForLaunch != null) {
              params.waitForLaunch = waitForLaunch;
            }
            await execute(driver, 'mobile: deepLink', params);
          } else if (platform === PLATFORM.ios) {
            const params: Record<string, unknown> = { url };
            if (appId != null) {
              params.bundleId = appId;
            }
            await execute(driver, 'mobile: deepLink', params);
          } else {
            throw new Error(
              `Unsupported platform: ${platform}. Only Android and iOS are supported.`
            );
          }
        } else if (isAndroidUiautomator2DriverSession(driver)) {
          await (driver as AndroidUiautomator2Driver).mobileDeepLink(
            url,
            appId ?? undefined,
            waitForLaunch ?? true
          );
        } else if (isXCUITestDriverSession(driver)) {
          await (driver as XCUITestDriver).mobileDeepLink(
            url,
            appId ?? undefined
          );
        } else {
          throw new Error('Unsupported driver for deep link');
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully opened deep link "${url}"${appId ? ` with app ${appId}` : ''}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to open deep link "${url}". err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
