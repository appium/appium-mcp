import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { resolveAppId } from './resolve-app-id.js';

export default function clearApp(server: FastMCP): void {
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
    name: 'appium_mobile_clear_app',
    description:
      'Clear all user data and cache for an installed app without uninstalling it (Appium `mobile: clearApp`). ' +
      'Android: uses `pm clear` (package name); stop the app first for reliable results on devices and emulators. ' +
      'iOS: Simulator only (bundle ID); `mobile: clearApp` is not supported on real devices.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
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
        const platform = getPlatformName(driver);
        const params =
          platform === PLATFORM.android ? { appId: id } : { bundleId: id };
        await execute(driver, 'mobile: clearApp', params);
        return {
          content: [
            {
              type: 'text',
              text: 'App data cleared successfully',
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to clear app data. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
