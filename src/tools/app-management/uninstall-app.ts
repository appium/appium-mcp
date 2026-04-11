import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { resolveId, invalidateAppListCache } from './resolve-app-id.js';

export default function uninstallApp(server: FastMCP): void {
  const schema = z
    .object({
      id: z
        .string()
        .optional()
        .describe(
          'App identifier (package name for Android, bundle ID for iOS). Takes precedence over name. Required if name is not provided.'
        ),
      name: z
        .string()
        .optional()
        .describe(
          'Human-readable app name (e.g. "Spotify"). Used to resolve the app id when id is not provided. Required if id is not provided.'
        ),
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to target. If omitted, uses the active session.'),
      keepData: z
        .boolean()
        .optional()
        .describe(
          'Keep the application data and cache folders after uninstall. Android only.'
        ),
    })
    .refine((args) => args.id || args.name, {
      message: 'Either id or name must be provided',
    });

  server.addTool({
    name: 'appium_uninstall_app',
    description:
      'Uninstall an app from the device. Either id or name must be provided.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { keepData } = args;
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }
      const id = await resolveId(args.id, args.name, args.sessionId);
      try {
        const platform = getPlatformName(driver);
        const params =
          platform === PLATFORM.android
            ? { appId: id, keepData: keepData ?? false }
            : { bundleId: id };
        const removed = await execute(driver, 'mobile: removeApp', params);
        if (removed) {
          invalidateAppListCache(args.sessionId);
        }
        return {
          content: [
            {
              type: 'text',
              text: removed
                ? 'App uninstalled successfully'
                : `App "${id}" was not installed, nothing to uninstall.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to uninstall app. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
