import type {ContentResult} from 'fastmcp';

import {execute} from '../../command.js';
import {getPlatformName, isRemoteDriverSession, PLATFORM} from '../../session-store.js';
import {validateEmbeddedAppPath} from '../../utils/remote-app-policy.js';
import {errorResult, resolveDriver, textResult, toolErrorMessage} from '../tool-response.js';
import {invalidateAppListCache} from './resolve-app-id.js';

export async function install(path: string, sessionId?: string): Promise<ContentResult> {
  const resolved = await resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const {driver} = resolved;
  try {
    if (!isRemoteDriverSession(driver)) {
      validateEmbeddedAppPath(path);
    }
    const platform = getPlatformName(driver);
    const params = platform === PLATFORM.android ? {appPath: path} : {app: path};
    await execute(driver, 'mobile: installApp', params);
    invalidateAppListCache(sessionId);
    return textResult('App installed successfully');
  } catch (err: unknown) {
    return errorResult(`Failed to install app. err: ${toolErrorMessage(err)}`);
  }
}
