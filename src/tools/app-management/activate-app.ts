import { FastMCP } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { z } from 'zod';
import { activateApp as _activateApp } from '../../command.js';

export default function activateApp(server: FastMCP): void {
  const activateAppSchema = z.object({
    id: z.string().describe('The app id'),
  });

  server.addTool({
    name: 'appium_activate_app',
    description: 'Activate app by id',
    parameters: activateAppSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: { id: string }, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        await _activateApp(driver, args.id);
        return {
          content: [
            {
              type: 'text',
              text: `App ${args.id} activated correctly.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error activating the app ${args.id}: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
