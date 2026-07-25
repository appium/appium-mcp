import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { elementUUIDScheme } from '../../schema.js';
import { getElementAttribute } from '../../command.js';
import {
  resolveDriver,
  textResultWithPrimaryElementId,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';
import { aiElementWebDriverRejectionIfNeeded } from '../gestures/handlers/ai-element.js';

export default function getElementAttributeTool(server: FastMCP): void {
  const schema = z.object({
    elementUUID: elementUUIDScheme,
    attribute: z
      .string()
      .describe(
        'Attribute name, e.g. enabled, displayed, text, value, label, resource-id.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Target session; defaults to active.'),
  });

  server.addTool({
    name: 'appium_get_element_attribute',
    description: 'Read an element state/property attribute.',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      const aiRejection = aiElementWebDriverRejectionIfNeeded(args.elementUUID);
      if (aiRejection) {
        return aiRejection;
      }

      try {
        const value = await getElementAttribute(
          driver,
          args.elementUUID,
          args.attribute
        );
        const detail =
          value !== null
            ? `Attribute "${args.attribute}" of element ${args.elementUUID}: ${value}`
            : `Attribute "${args.attribute}" is not set on element ${args.elementUUID}`;
        return textResultWithPrimaryElementId(args.elementUUID, detail);
      } catch (err: unknown) {
        return errorResult(
          `Failed to get attribute "${args.attribute}" from element ${args.elementUUID}. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
