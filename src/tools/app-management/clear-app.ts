import type { ContentResult } from 'fastmcp';
import {
  getPlatformName,
  PLATFORM,
  type DriverInstance,
} from '../../session-store.js';
import { execute } from '../../command.js';

export async function clear(
  driver: DriverInstance,
  id: string
): Promise<ContentResult> {
  try {
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
