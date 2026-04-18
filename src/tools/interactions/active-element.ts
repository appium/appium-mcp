import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getActiveElement as _getActiveElement } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

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
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

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

        return textResult(
          `Successfully found an active element. Element id: ${elementId}`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to find an active element. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
