/**
 * Tool to delete the current mobile session and clean up resources
 */
import { z } from 'zod';
import { safeDeleteSession } from '../../session-store.js';
import log from '../../logger.js';
import { textResult, errorResult } from '../tool-response.js';

export default function deleteSession(server: any): void {
  server.addTool({
    name: 'delete_session',
    description:
      'Delete a mobile session and clean up resources. If sessionId is omitted, deletes the active session.',
    parameters: z.object({
      sessionId: z
        .string()
        .optional()
        .describe(
          'Optional session ID to delete. If omitted, deletes active session.'
        ),
    }),
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: { sessionId?: string }): Promise<any> => {
      try {
        const deleted = await safeDeleteSession(args.sessionId);

        if (deleted) {
          return textResult(
            args.sessionId
              ? `Session ${args.sessionId} deleted successfully.`
              : 'Active session deleted successfully.'
          );
        } else {
          return textResult(
            args.sessionId
              ? `Session ${args.sessionId} not found or deletion already in progress.`
              : 'No active session found or deletion already in progress.'
          );
        }
      } catch (error: any) {
        log.error(`Error deleting session`, error);
        // don't raise an error — a failed deletion still means a new session is needed
        return errorResult(`Session delete might fail as error ${error}`);
      }
    },
  });
}
