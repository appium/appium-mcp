import type { ContentResult } from 'fastmcp';
import {
  getPlatformName,
  isRemoteDriverSession,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function isInstalled(
  id: string,
  sessionId?: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  try {
    let result: boolean;
    if (isRemoteDriverSession(driver)) {
      const platform = getPlatformName(driver);
      const params =
        platform === PLATFORM.android ? { appId: id } : { bundleId: id };
      const raw = await execute(driver, 'mobile: isAppInstalled', params);
      result = Boolean(raw);
    } else if (isXCUITestDriverSession(driver)) {
      result = await (driver as XCUITestDriver).isAppInstalled(id);
    } else if (isAndroidUiautomator2DriverSession(driver)) {
      result = await (driver as AndroidUiautomator2Driver).adb.isAppInstalled(
        id
      );
    } else {
      return errorResult('Unsupported driver for is_installed');
    }

    return textResult(
      result ? `App "${id}" is installed.` : `App "${id}" is not installed.`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to check if app is installed. err: ${toolErrorMessage(err)}`
    );
  }
}
