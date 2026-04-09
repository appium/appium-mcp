import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../../session-store.js';
import { activateApp as _activateApp } from '../../command.js';

export async function activate(
  driver: DriverInstance,
  id: string
): Promise<ContentResult> {
  try {
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
