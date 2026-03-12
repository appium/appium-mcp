import { z } from 'zod';
import { setActiveSessionGroup } from '../../session-store.js';

export default function selectSessionGroup(server: any): void {
  server.addTool({
    name: 'select_session_group',
    description:
      'Mark an existing session group as the active group for broadcast-oriented workflows.',
    parameters: z.object({
      groupId: z.string().describe('The group ID to activate.'),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: { groupId: string }): Promise<any> => {
      const updated = setActiveSessionGroup(args.groupId);

      if (!updated) {
        return {
          content: [
            {
              type: 'text',
              text: `Session group ${args.groupId} was not found. Use list_session_groups to see available group IDs.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Session group ${args.groupId} is now active.`,
          },
        ],
      };
    },
  });
}
