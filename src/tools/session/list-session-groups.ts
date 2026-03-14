import { z } from 'zod';
import { listSessionGroups } from '../../session-store.js';

export default function listSessionGroupsTool(server: any): void {
  server.addTool({
    name: 'list_session_groups',
    description:
      'List all saved session groups that can be used for broadcast-style operations.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (): Promise<any> => {
      const groups = listSessionGroups();

      if (!groups.length) {
        return {
          content: [
            {
              type: 'text',
              text: 'No session groups found.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: groups
              .map(
                (group, index) =>
                  `${index + 1}. groupId=${group.groupId}${group.isActive ? ' (active)' : ''}\n   sessions=${group.sessionIds.join(', ')}`
              )
              .join('\n'),
          },
        ],
      };
    },
  });
}
