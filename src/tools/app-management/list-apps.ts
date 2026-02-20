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
  return Object.entries(result).map(([id, attrs]) => {
    let appName = '';
    if (attrs) {
      if (typeof attrs.CFBundleDisplayName === 'string') {
        appName = attrs.CFBundleDisplayName;
      } else if (typeof attrs.CFBundleName === 'string') {
        appName = attrs.CFBundleName;
      } else if (typeof (attrs as Record<string, unknown>).name === 'string') {
        appName = (attrs as Record<string, unknown>).name as string;
      }
    }
    return { packageName: id, appName };
  });
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
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return normalizeListAppsResult(
        result as Record<string, Record<string, unknown> | undefined>
      );
    }
    return [];
  }

  if (
    platform === PLATFORM.android &&
    isAndroidUiautomator2DriverSession(driver)
  ) {
    const result = await (driver as AndroidUiautomator2Driver).mobileListApps();
    if (Array.isArray(result)) {
      return result
        .filter((id): id is string => typeof id === 'string')
        .map((packageName) => ({ packageName, appName: packageName }));
    }
    if (result && typeof result === 'object') {
      return normalizeListAppsResult(
        result as Record<string, Record<string, unknown> | undefined>
      );
    }
    return [];
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
