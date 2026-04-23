import { detachSession, getSessionOwnership } from '../../session-store.js';
import { errorResult, textResult } from '../tool-response.js';

export async function detachSessionAction(sessionId?: string): Promise<any> {
  const ownership = getSessionOwnership(sessionId);
  if (!ownership) {
    return errorResult(
      sessionId ? `Session ${sessionId} not found.` : 'No active session found.'
    );
  }
  if (ownership !== 'attached') {
    return errorResult(
      sessionId
        ? `Session ${sessionId} is owned by MCP Appium. Use action=delete to remove it.`
        : 'Active session is owned by MCP Appium. Use action=delete to remove it.'
    );
  }

  const detached = detachSession(sessionId);
  if (!detached) {
    return errorResult(
      sessionId ? `Session ${sessionId} not found.` : 'No active session found.'
    );
  }

  return textResult(
    sessionId
      ? `Session ${sessionId} detached successfully.`
      : 'Active session detached successfully.'
  );
}
