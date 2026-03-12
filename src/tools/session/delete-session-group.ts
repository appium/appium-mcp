import { z } from 'zod';
import { deleteSessionGroup } from '../../session-store.js';

export default function deleteSessionGroupTool(server: any): void {
  server.addTool({
    name: 'delete_session_group',
    description: 'Delete a saved session group.',
    parameters: z.object({
      groupId: z.string().describe('The group ID to delete.'),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: { groupId: string }): Promise<any> => {
      const deleted = deleteSessionGroup(args.groupId);

      return {
        content: [
          {
            type: 'text',
            text: deleted
              ? `Session group ${args.groupId} deleted successfully.`
              : `Session group ${args.groupId} was not found.`,
          },
        ],
        ...(deleted ? {} : { isError: true }),
      };
    },
  });
}
