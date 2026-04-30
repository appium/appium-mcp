import { safeDeleteSession } from '../../session-store.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';

export async function deleteSessionAction(sessionId?: string): Promise<any> {
  try {
    const deleted = await safeDeleteSession(sessionId);
    if (deleted) {
      return textResult(
        sessionId
          ? `Session ${sessionId} deleted successfully.`
          : 'Active session deleted successfully.'
      );
    }

    return errorResult(
      sessionId
        ? `Session ${sessionId} not found or deletion already in progress.`
        : 'No active session found or deletion already in progress.'
    );
  } catch (error: unknown) {
    return errorResult(`Failed to delete session. ${toolErrorMessage(error)}`);
  }
}
