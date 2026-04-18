import type { ContentResult } from 'fastmcp';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function terminate(
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
    await execute(driver, 'mobile: terminateApp', params);
    return textResult('App terminated successfully');
  } catch (err: unknown) {
    return errorResult(
      `Failed to terminate app. err: ${toolErrorMessage(err)}`
    );
  }
}
