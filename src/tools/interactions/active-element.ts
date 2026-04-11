import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { getActiveElement as _getActiveElement } from '../../command.js';

export default function getActiveElement(server: FastMCP): void {
  const schema = z.object({
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_get_active_element',
    description:
      'Get the currently active/focused element and return its UUID for follow-up interactions. [PRIORITY 1: Use this first when you need to find what element currently has focus]',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const element = await _getActiveElement(driver);
        const elementId =
          element['element-6066-11e4-a52e-4f735466cecf'] ??
          (element as unknown as { ELEMENT?: string }).ELEMENT;

        if (!elementId) {
          throw new Error(
            'Active element was returned without a valid element ID'
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully found an active element. Element id: ${elementId}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to find an active element. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
