import type { ContentResult } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { queryAppState as _queryAppState } from '../../command.js';

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
  try {
    const driver = getDriver(sessionId);
    if (!driver) {
      return { content: [{ type: 'text', text: 'No driver found' }] };
    }
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
