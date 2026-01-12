import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
} from '../../session-store.js';
import {
  createUIResource,
  createAppListUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';

async function listAppsFromDevice(): Promise<any[]> {
  const driver = await getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  if (isRemoteDriverSession(driver)) {
    throw new Error('listApps is not yet implemented for the remote driver');
  }

  const platform = getPlatformName(driver);
  if (platform === 'iOS') {
    throw new Error('listApps is not yet implemented for iOS');
  }

  const appPackages = await (driver as AndroidUiautomator2Driver).adb.adbExec([
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
        const textResponse = {
          content: [
            {
              type: 'text',
              text: `Installed apps: ${JSON.stringify(apps, null, 2)}`,
            },
          ],
        };

        // Add interactive app list UI
        const uiResource = createUIResource(
          `ui://appium-mcp/app-list/${Date.now()}`,
          createAppListUI(apps)
        );

        return addUIResourceToResponse(textResponse, uiResource);
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
