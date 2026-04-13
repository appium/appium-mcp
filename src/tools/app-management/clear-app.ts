import type { ContentResult } from 'fastmcp';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

export async function clear(
  id: string,
  sessionId?: string
): Promise<ContentResult> {
  try {
    const driver = getDriver(sessionId);
    if (!driver) {
      return { content: [{ type: 'text', text: 'No driver found' }] };
    }
    const platform = getPlatformName(driver);
    const params =
      platform === PLATFORM.android ? { appId: id } : { bundleId: id };
    await execute(driver, 'mobile: clearApp', params);
    return {
      content: [{ type: 'text', text: 'App data cleared successfully' }],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to clear app data. err: ${err.toString()}`,
        },
      ],
    };
  }
}
