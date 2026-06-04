import type { ContentResult } from 'fastmcp';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { DriverInstance } from '../../session-store.js';
import {
  asAndroidDriver,
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
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const execAsync = promisify(exec);

export async function listAppsFromDevice(
  driver: DriverInstance,
  applicationType: 'User' | 'System' = 'User'
): Promise<{ packageName: string; appName: string }[]> {
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
    const result = await asAndroidDriver(driver).mobileListApps();
    const ids = Object.keys(result || {});
    return ids.map((packageName) => ({ packageName, appName: packageName }));
  }

  throw new Error(`listApps is not implemented for platform: ${platform}`);
}

export async function list(
  applicationType?: 'User' | 'System',
  sessionId?: string
): Promise<ContentResult> {
  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  try {
    const apps = await listAppsFromDevice(
      resolved.driver,
      applicationType ?? 'User'
    );
    const textResponse = textResult(
      `Installed apps: ${JSON.stringify(apps, null, 2)}`
    );
    const uiResource = createUIResource(
      `ui://appium-mcp/app-list/${Date.now()}`,
      createAppListUI(apps)
    );
    return addUIResourceToResponse(textResponse, uiResource);
  } catch (err: unknown) {
    return errorResult(`Failed to list apps. err: ${toolErrorMessage(err)}`);
  }
}

/** Extract package ids from the `mobile: listApps` result (map or legacy array). */
function androidListAppsPackageIds(
  result: Record<string, unknown> | string[]
): string[] {
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
