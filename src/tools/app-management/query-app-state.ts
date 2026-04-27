import type { ContentResult } from 'fastmcp';
import { queryAppState as _queryAppState } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const APP_STATE_LABELS: Record<number, string> = {
  0: 'not installed',
  1: 'not running',
  2: 'running in background (suspended)',
  3: 'running in background',
  4: 'running in foreground',
};

export async function queryState(
  id: string,
  sessionId?: string
): Promise<ContentResult> {
  const resolved = resolveDriver(sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

  try {
    const state = await _queryAppState(driver, id);
    const label = APP_STATE_LABELS[state] ?? 'unknown';
    return textResult(`App "${id}" state: ${state} (${label})`);
  } catch (err: unknown) {
    return errorResult(
      `Failed to query app state for "${id}": ${toolErrorMessage(err)}`
    );
  }
}
