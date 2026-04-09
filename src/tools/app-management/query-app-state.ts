import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../session-store.js';
import { queryAppState as _queryAppState } from '../../command.js';

const APP_STATE_LABELS: Record<number, string> = {
  0: 'not installed',
  1: 'not running',
  2: 'running in background (suspended)',
  3: 'running in background',
  4: 'running in foreground',
};

export async function queryState(
  driver: DriverInstance,
  id: string
): Promise<ContentResult> {
  try {
    const state = await _queryAppState(driver, id);
    const label = APP_STATE_LABELS[state] ?? 'unknown';
    return {
      content: [
        { type: 'text', text: `App "${id}" state: ${state} (${label})` },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to query app state for "${id}": ${err.toString()}`,
        },
      ],
    };
  }
}
