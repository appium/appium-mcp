import type { ContentResult } from 'fastmcp';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { invalidateAppListCache } from './resolve-app-id.js';
import {
  errorResult,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function install(
  path: string,
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
      platform === PLATFORM.android ? { appPath: path } : { app: path };
    await execute(driver, 'mobile: installApp', params);
    invalidateAppListCache(sessionId);
    return textResult('App installed successfully');
  } catch (err: unknown) {
    return errorResult(`Failed to install app. err: ${toolErrorMessage(err)}`);
  }
}
