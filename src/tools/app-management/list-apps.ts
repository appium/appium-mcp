import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, getPlatformName } from '../../session-store.js';

async function listAppsFromDevice(): Promise<any[]> {
  const driver = await getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  const platform = getPlatformName(driver);
  if (platform === 'iOS') {
    throw new Error('listApps is not yet implemented for iOS');
  }

  const appPackages = await driver.adb.adbExec([
    'shell',
    'cmd',
    'package',
    'list',
    'packages',
  ]);

  const apps: any[] = appPackages
    .split('package:')
    .filter((s: any) => s.trim())
    .map((s: any) => ({
      packageName: s.trim(),
      appName: '',
    }));

  return apps;
}

export default function listApps(server: FastMCP): void {
  const schema = z.object({});

  server.addTool({
    name: 'appium_list_apps',
    description: 'List all installed apps on the device.',
    parameters: schema,
    execute: async () => {
      try {
        const apps = await listAppsFromDevice();
        return {
          content: [
            {
              type: 'text',
              text: `Installed apps: ${JSON.stringify(apps, null, 2)}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list apps. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
