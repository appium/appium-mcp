import { z } from 'zod';
import { listSessions, setSessionGroup } from '../../session-store.js';

export default function createSessionGroup(server: any): void {
  server.addTool({
    name: 'create_session_group',
    description:
      'Create or replace a named session group for later broadcast-style operations. If sessionIds is omitted, all current sessions are added.',
    parameters: z.object({
      groupId: z.string().describe('Unique group identifier.'),
      sessionIds: z
        .array(z.string())
        .optional()
        .describe(
          'Optional explicit session IDs to include. If omitted, all current sessions are used.'
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: {
      groupId: string;
      sessionIds?: string[];
    }): Promise<any> => {
      const sessionIds =
        args.sessionIds && args.sessionIds.length
          ? args.sessionIds
          : listSessions().map((session) => session.sessionId);

      const group = setSessionGroup(args.groupId, sessionIds);

      return {
        content: [
          {
            type: 'text',
            text: `Session group ${group.groupId} saved with ${group.sessionIds.length} session(s): ${group.sessionIds.join(', ')}`,
          },
        ],
      };
    },
  });
}
