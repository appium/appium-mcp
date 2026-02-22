import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

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
      .describe(
        'App identifier: bundleId (iOS) or package (Android). Optional on Android since UIA2 3.9.3.'
      ),
    waitForLaunch: z
      .boolean()
      .optional()
      .describe(
        'Android only. If false, ADB does not wait for the activity to return control. Defaults to true.'
      ),
  });

  server.addTool({
    name: 'appium_deep_link',
    description:
      'Open a deep link URL with the default or specified app. Supported on Android and iOS.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { url, appId, waitForLaunch } = args;
      const driver = await getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }
      try {
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
