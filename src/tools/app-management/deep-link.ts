import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { executeAcrossSessions } from '../../broadcast.js';
import { execute } from '../../command.js';
import {
  resolveSessionTargetFromArgs,
  sessionTargetSchema,
} from '../session/targeting.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';

export default function deepLink(server: FastMCP): void {
  const schema = z.intersection(
    z.object({
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
    }),
    sessionTargetSchema
  );

  server.addTool({
    name: 'appium_deep_link',
    description:
      'Open a deep link URL with the default or specified app. Supported on Android and iOS. Can target the active session, one session, a session group, or all sessions.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { url, appId, waitForLaunch } = args;
      const target = resolveSessionTargetFromArgs(args);

      const result = await executeAcrossSessions(target, async (session) => {
        const driver = session.driver;

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
            return `Opened on ${platform}`;
          }

          if (platform === PLATFORM.ios) {
            const params: Record<string, unknown> = { url };
            if (appId != null) {
              params.bundleId = appId;
            }
            await execute(driver, 'mobile: deepLink', params);
            return `Opened on ${platform}`;
          }

          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        if (isAndroidUiautomator2DriverSession(driver)) {
          await (driver as AndroidUiautomator2Driver).mobileDeepLink(
            url,
            appId ?? undefined,
            waitForLaunch ?? true
          );
          return 'Opened on Android';
        }

        if (isXCUITestDriverSession(driver)) {
          await (driver as XCUITestDriver).mobileDeepLink(
            url,
            appId ?? undefined
          );
          return 'Opened on iOS';
        }

        throw new Error('Unsupported driver for deep link');
      });

      const summary =
        result.total === 1
          ? result.results[0].status === 'success'
            ? `Successfully opened deep link "${url}"${appId ? ` with app ${appId}` : ''}`
            : `Failed to open deep link "${url}". err: ${result.results[0].error}`
          : `Deep link broadcast finished for ${result.total} session(s). ${result.succeeded} succeeded, ${result.failed} failed.`;

      const details = result.results
        .map(
          (item, index) =>
            `${index + 1}. sessionId=${item.sessionId}, device=${item.deviceName || 'Unknown'}, status=${item.status}${item.error ? `, error=${item.error}` : ''}`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text:
              result.total === 1
                ? summary
                : `${summary}\n\nResults:\n${details}`,
          },
        ],
        ...(result.failed > 0 ? { isError: true } : {}),
      };
    },
  });
}
