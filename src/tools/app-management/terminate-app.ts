import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { resolveAppId } from './resolve-app-id.js';

export default function terminateApp(server: FastMCP): void {
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
    name: 'appium_terminate_app',
    description: 'Terminate an app on the device.',
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
        await execute(driver, 'mobile: terminateApp', params);
        return {
          content: [
            {
              type: 'text',
              text: 'App terminated successfully',
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to terminate app. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
