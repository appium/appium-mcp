import type { ContentResult } from 'fastmcp';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
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
import { execute } from '../../command.js';

const execAsync = promisify(exec);

/** Extract package ids from the `mobile: listApps` result (map or legacy array). */
function androidListAppsPackageIds(
  result: Record<string, unknown> | string[] | null | undefined
): string[] {
  if (result == null) {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }
  return Object.keys(result);
}

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

export async function listAppsFromDevice(
  applicationType: 'User' | 'System' = 'User',
  sessionId?: string
): Promise<{ packageName: string; appName: string }[]> {
  const driver = getDriver(sessionId);
  if (!driver) {
    throw new Error('No driver found');
  }

  const platform = getPlatformName(driver);

  if (isRemoteDriverSession(driver)) {
    if (platform === PLATFORM.android) {
      const result = await execute(driver, 'mobile: listApps', {});
      const ids = androidListAppsPackageIds(result);
      return ids.map((packageName) => ({ packageName, appName: packageName }));
    }
    if (platform === PLATFORM.ios) {
      const result = await execute(driver, 'mobile: listApps', {
        applicationType,
      });
      return normalizeListAppsResult(
        (result as Record<string, Record<string, unknown> | undefined>) || {}
      );
    }
    throw new Error(`listApps is not implemented for platform: ${platform}`);
  }

  if (platform === PLATFORM.ios && isXCUITestDriverSession(driver)) {
    const xcuiDriver = driver as XCUITestDriver;
    if (xcuiDriver.isSimulator()) {
      const udid = xcuiDriver.caps?.udid;
      if (!udid) {
        throw new Error(
          'Could not determine simulator UDID from session capabilities'
        );
      }
      const { stdout } = await execAsync(
        `xcrun simctl listapps "${udid}" | plutil -convert json -o - -`
      );
      const result = JSON.parse(stdout);
      return normalizeListAppsResult(result || {});
    }
    const result = await (driver as XCUITestDriver).mobileListApps(
      applicationType
    );
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

export async function list(
  applicationType?: 'User' | 'System',
  sessionId?: string
): Promise<ContentResult> {
  try {
    const apps = await listAppsFromDevice(applicationType, sessionId);
    const textResponse = {
      content: [
        {
          type: 'text' as const,
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
        { type: 'text', text: `Failed to list apps. err: ${err.toString()}` },
      ],
    };
  }
}
