import { z } from 'zod';
import { setActiveSession } from '../../session-store.js';
import { textResult, errorResult } from '../tool-response.js';

export default function selectSession(server: any): void {
  server.addTool({
    name: 'select_session',
    description:
      'Set an existing Appium session as the active session for subsequent tool calls.',
    parameters: z.object({
      sessionId: z.string().describe('The session ID to activate.'),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: { sessionId: string }): Promise<any> => {
      const updated = setActiveSession(args.sessionId);

      if (!updated) {
        return errorResult(
          `Session ${args.sessionId} was not found. Use list_sessions to see available IDs.`
        );
      }

      return textResult(`Session ${args.sessionId} is now active.`);
    },
  });
}
