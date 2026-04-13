import type { ContentResult } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { activateApp as _activateApp } from '../../command.js';

export async function activate(
  id: string,
  sessionId?: string
): Promise<ContentResult> {
  try {
    const driver = getDriver(sessionId);
    if (!driver) {
      return { content: [{ type: 'text', text: 'No driver found' }] };
    }
    await _activateApp(driver, id);
    return {
      content: [{ type: 'text', text: `App ${id} activated correctly.` }],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error activating the app ${id}: ${err.toString()}`,
        },
      ],
    };
  }
}
