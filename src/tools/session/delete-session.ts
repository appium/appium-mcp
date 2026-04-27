import { safeDeleteSession } from '../../session-store.js';
import log from '../../logger.js';
import { textResult, toolErrorMessage } from '../tool-response.js';

export async function deleteSessionAction(sessionId?: string): Promise<any> {
  try {
    const deleted = await safeDeleteSession(sessionId);
    if (deleted) {
      return textResult(
        sessionId
          ? `Session ${sessionId} deleted successfully.`
          : 'Active session deleted successfully.'
      );
    } else {
      return textResult(
        sessionId
          ? `Session ${sessionId} not found or deletion already in progress.`
          : 'No active session found or deletion already in progress.'
      );
    }
  } catch (error: unknown) {
    log.error(`Error deleting session`, error);
    return textResult(
      `Session delete may not have completed cleanly: ${toolErrorMessage(error)}`
    );
  }
}
