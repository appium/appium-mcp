import type { ContentResult } from 'fastmcp';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { invalidateAppListCache } from './resolve-app-id.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function uninstall(
  id: string,
  keepData?: boolean,
  sessionId?: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  try {
    const platform = getPlatformName(driver);
    const params =
      platform === PLATFORM.android
        ? { appId: id, keepData: keepData ?? false }
        : { bundleId: id };
    const removed = await execute(driver, 'mobile: removeApp', params);
    if (removed) {
      invalidateAppListCache(sessionId);
    }
    return textResult(
      removed
        ? 'App uninstalled successfully'
        : `App "${id}" was not installed, nothing to uninstall.`
    );
  } catch (err: unknown) {
    return errorResult(
      `Failed to uninstall app. err: ${toolErrorMessage(err)}`
    );
  }
}
