import { detachSession, getSessionOwnership } from '../../session-store.js';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';

/**
 * Detach an attached Appium session from MCP Appium without deleting the
 * remote session itself.
 *
 * @param sessionId - Optional session id to detach. Defaults to the active session.
 * @returns A tool response describing whether the detach succeeded.
 */
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
