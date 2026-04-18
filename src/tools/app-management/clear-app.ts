import type { ContentResult } from 'fastmcp';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function clear(
  id: string,
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
      platform === PLATFORM.android ? { appId: id } : { bundleId: id };
    await execute(driver, 'mobile: clearApp', params);
    return textResult('App data cleared successfully');
  } catch (err: unknown) {
    return errorResult(
      `Failed to clear app data. err: ${toolErrorMessage(err)}`
    );
  }
}
