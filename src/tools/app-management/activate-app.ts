import type { ContentResult } from 'fastmcp';
import { activateApp as _activateApp } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export async function activate(
  id: string,
  sessionId?: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  try {
    await _activateApp(driver, id);
    return textResult(`App ${id} activated correctly.`);
  } catch (err: unknown) {
    return errorResult(
      `Error activating the app ${id}: ${toolErrorMessage(err)}`
    );
  }
}
