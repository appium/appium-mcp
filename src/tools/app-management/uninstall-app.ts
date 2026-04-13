import type { ContentResult } from 'fastmcp';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { invalidateAppListCache } from './resolve-app-id.js';

export async function uninstall(
  id: string,
  keepData?: boolean,
  sessionId?: string
): Promise<ContentResult> {
  try {
    const driver = getDriver(sessionId);
    if (!driver) {
      return { content: [{ type: 'text', text: 'No driver found' }] };
    }
    const platform = getPlatformName(driver);
    const params =
      platform === PLATFORM.android
        ? { appId: id, keepData: keepData ?? false }
        : { bundleId: id };
    const removed = await execute(driver, 'mobile: removeApp', params);
    if (removed) {
      invalidateAppListCache(sessionId);
    }
    return {
      content: [
        {
          type: 'text',
          text: removed
            ? 'App uninstalled successfully'
            : `App "${id}" was not installed, nothing to uninstall.`,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to uninstall app. err: ${err.toString()}`,
        },
      ],
    };
  }
}
