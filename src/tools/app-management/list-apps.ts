import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import type {AndroidUiautomator2Driver} from 'appium-uiautomator2-driver';
import type {XCUITestDriver} from 'appium-xcuitest-driver';
import type {ContentResult} from 'fastmcp';
import {exec} from 'teen_process';

import {execute, runSimctl} from '../../command.js';
import type {DriverInstance} from '../../session-store.js';
import {
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import {createUIResource, createAppListUI, addUIResourceToResponse} from '../../ui/mcp-ui-utils.js';
import {resolveDriver, textResult, errorResult, toolErrorMessage} from '../tool-response.js';

export async function listAppsFromDevice(
  driver: DriverInstance,
  applicationType: 'User' | 'System' = 'User',
): Promise<{packageName: string; appName: string}[]> {
  const platform = getPlatformName(driver);

  if (isRemoteDriverSession(driver)) {
    if (platform === PLATFORM.android) {
      const result = await execute(driver, 'mobile: listApps', {});
      const ids = androidListAppsPackageIds(result);
      return ids.map((packageName) => ({packageName, appName: packageName}));
    }
    if (platform === PLATFORM.ios) {
      const result = await execute(driver, 'mobile: listApps', {
        applicationType,
      });
      return normalizeListAppsResult((result as Record<string, Record<string, unknown> | undefined>) || {});
    }
    throw new Error(`listApps is not implemented for platform: ${platform}`);
  }

  if (platform === PLATFORM.ios && isXCUITestDriverSession(driver)) {
    const xcuiDriver = driver as XCUITestDriver;
    if (xcuiDriver.isSimulator()) {
      const udid = xcuiDriver.caps?.udid;
      if (!udid) {
        throw new Error('Could not determine simulator UDID from session capabilities');
      }
      const {stdout} = (await runSimctl(driver, 'listapps', [], 5000)) || {stdout: ''};
      const result = JSON.parse(await convertPlistToJson(stdout));
      return normalizeListAppsResult(result || {});
    }
    const result = await (driver as XCUITestDriver).mobileListApps(applicationType);
    return normalizeListAppsResult(result || {});
  }

  if (platform === PLATFORM.android && isAndroidUiautomator2DriverSession(driver)) {
    const result = await (driver as AndroidUiautomator2Driver).mobileListApps();
    const ids = Object.keys(result || {});
    return ids.map((packageName) => ({packageName, appName: packageName}));
  }

  throw new Error(`listApps is not implemented for platform: ${platform}`);
}

async function convertPlistToJson(plist: string, timeout = 5000): Promise<string> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'appium-mcp-listapps-'));
  const plistPath = join(temporaryDirectory, 'listapps.plist');

  try {
    await writeFile(plistPath, plist, 'utf8');
    const {stdout} = await exec('plutil', ['-convert', 'json', '-o', '-', '--', plistPath], {timeout});
    return stdout;
  } finally {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
}

export async function list(applicationType?: 'User' | 'System', sessionId?: string): Promise<ContentResult> {
  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  try {
    const apps = await listAppsFromDevice(resolved.driver, applicationType ?? 'User');
    const textResponse = textResult(`Installed apps: ${JSON.stringify(apps, null, 2)}`);
    return addUIResourceToResponse(textResponse, () =>
      createUIResource(`ui://appium-mcp/app-list/${Date.now()}`, createAppListUI(apps)),
    );
  } catch (err: unknown) {
    return errorResult(`Failed to list apps. err: ${toolErrorMessage(err)}`);
  }
}

/** Extract package ids from the `mobile: listApps` result (map or legacy array). */
function androidListAppsPackageIds(result: Record<string, unknown> | string[]): string[] {
  if (Array.isArray(result)) {
    return result;
  }
  return Object.keys(result);
}

function normalizeListAppsResult(
  result: Record<string, Record<string, unknown> | undefined>,
): {packageName: string; appName: string}[] {
  return Object.entries(result).map(([id, attrs]) => ({
    packageName: id,
    appName: (attrs?.CFBundleDisplayName || attrs?.CFBundleName || (attrs as any)?.name || '') as string,
  }));
}
