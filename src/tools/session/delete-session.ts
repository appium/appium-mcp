import { getSessionOwnership, safeDeleteSession } from '../../session-store.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';

export async function deleteSessionAction(
  sessionId?: string,
  force?: boolean
): Promise<any> {
  const ownership = getSessionOwnership(sessionId);
  if (!ownership) {
    return errorResult(
      sessionId ? `Session ${sessionId} not found.` : 'No active session found.'
    );
  }
  if (ownership === 'attached' && !force) {
    return errorResult(
      sessionId
        ? `Session ${sessionId} is attached from a remote server. Use action=detach to remove it from MCP without deleting the remote session, or pass force=true to delete the remote session.`
        : 'Active session is attached from a remote server. Use action=detach to remove it from MCP without deleting the remote session, or pass force=true to delete the remote session.'
    );
  }

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
