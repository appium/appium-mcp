import type {
  ContentResult,
  Context,
  FastMCP,
  FastMCPSessionAuth,
} from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import { getElementText } from '../../command.js';

export default function getText(server: FastMCP): void {
  const getTextSchema = z.object({
    elementUUID: elementUUIDScheme,
  });

  server.addTool({
    name: 'appium_get_text',
    description: 'Get text from an element',
    parameters: getTextSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof getTextSchema>,
      _context: Context<FastMCPSessionAuth>
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const text = getElementText(driver, args.elementUUID);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully got text ${text} from element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get text from element ${args.elementUUID}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
