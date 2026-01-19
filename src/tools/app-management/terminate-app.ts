import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

export default function terminateApp(server: FastMCP): void {
  const schema = z.object({
    id: z
      .string()
      .describe('App identifier (package name for Android, bundle ID for iOS)'),
  });

  server.addTool({
    name: 'appium_terminate_app',
    description: 'Terminate an app on the device.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { id } = args;
      const driver = await getDriver();
      if (!driver) {
        throw new Error('No driver found');
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
