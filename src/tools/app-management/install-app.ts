import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { invalidateAppListCache } from './resolve-app-id.js';

export default function installApp(server: FastMCP): void {
  const schema = z.object({
    path: z.string().describe('Path to the app file to install'),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_install_app',
    description: 'Install an app on the device from a file path.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { path } = args;
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }
      try {
        const platform = getPlatformName(driver);
        const params =
          platform === PLATFORM.android ? { appPath: path } : { app: path };
        await execute(driver, 'mobile: installApp', params);
        invalidateAppListCache(args.sessionId);
        return {
          content: [
            {
              type: 'text',
              text: 'App installed successfully',
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to install app. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
