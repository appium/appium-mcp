import { detachSession, getSessionOwnership } from '../../session-store.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';

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

  try {
    detachSession(sessionId);
  } catch (error: unknown) {
    return errorResult(toolErrorMessage(error));
  }

  return textResult(
    sessionId
      ? `Session ${sessionId} detached successfully.`
      : 'Active session detached successfully.'
  );
}
