import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, getPlatformName } from '../../session-store.js';

export default function installApp(server: FastMCP): void {
  const schema = z.object({
    path: z.string().describe('Path to the app file to install'),
  });

  server.addTool({
    name: 'appium_install_app',
    description: 'Install an app on the device from a file path.',
    parameters: schema,
    execute: async (args: z.infer<typeof schema>) => {
      const { path } = args;
      const driver = await getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }
      try {
        const platform = getPlatformName(driver);
        const params =
          platform === 'Android' ? { appPath: path } : { app: path };
        await (driver as any).execute('mobile: installApp', params);
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
