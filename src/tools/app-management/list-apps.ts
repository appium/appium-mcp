import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import {
  createUIResource,
  createAppListUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';

function normalizeListAppsResult(
  result: Record<string, Record<string, unknown> | undefined>
): { packageName: string; appName: string }[] {
  return Object.entries(result).map(([id, attrs]) => ({
    packageName: id,
    appName: (attrs?.CFBundleDisplayName ||
      attrs?.CFBundleName ||
      (attrs as any)?.name ||
      '') as string,
  }));
}

async function listAppsFromDevice(): Promise<
  { packageName: string; appName: string }[]
> {
  const driver = await getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  if (isRemoteDriverSession(driver)) {
    throw new Error('listApps is not yet implemented for the remote driver');
  }

  const platform = getPlatformName(driver);

  if (platform === PLATFORM.ios && isXCUITestDriverSession(driver)) {
    const result = await (driver as XCUITestDriver).mobileListApps();
    return normalizeListAppsResult(result || {});
  }

  if (
    platform === PLATFORM.android &&
    isAndroidUiautomator2DriverSession(driver)
  ) {
    const result = await (driver as AndroidUiautomator2Driver).mobileListApps();
    const ids = Object.keys(result || {});
    return ids.map((packageName) => ({ packageName, appName: packageName }));
  }

  throw new Error(`listApps is not implemented for platform: ${platform}`);
}

export default function listApps(server: FastMCP): void {
  const schema = z.object({});

  server.addTool({
    name: 'appium_list_apps',
    description:
      'List all installed apps on the device. On Android, only package IDs are returned (no display names); on iOS, bundle IDs and display names are returned.',
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
