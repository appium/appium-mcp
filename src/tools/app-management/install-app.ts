import type { ContentResult } from 'fastmcp';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { invalidateAppListCache } from './resolve-app-id.js';

export async function install(
  path: string,
  sessionId?: string
): Promise<ContentResult> {
  try {
    const driver = getDriver(sessionId);
    if (!driver) {
      return { content: [{ type: 'text', text: 'No driver found' }] };
    }
    const platform = getPlatformName(driver);
    const params =
      platform === PLATFORM.android ? { appPath: path } : { app: path };
    await execute(driver, 'mobile: installApp', params);
    invalidateAppListCache(sessionId);
    return { content: [{ type: 'text', text: 'App installed successfully' }] };
  } catch (err: any) {
    return {
      content: [
        { type: 'text', text: `Failed to install app. err: ${err.toString()}` },
      ],
    };
  }
}
