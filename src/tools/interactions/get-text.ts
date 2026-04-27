import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { elementUUIDScheme } from '../../schema.js';
import { getElementText } from '../../command.js';
import {
  resolveDriver,
  textResultWithPrimaryElementId,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

export default function getText(server: FastMCP): void {
  const getTextSchema = z.object({
    elementUUID: elementUUIDScheme,
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
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
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const text = await getElementText(driver, args.elementUUID);
        return textResultWithPrimaryElementId(
          args.elementUUID,
          `Successfully got text ${text} from element ${args.elementUUID}.`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to get text from element ${args.elementUUID}. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
