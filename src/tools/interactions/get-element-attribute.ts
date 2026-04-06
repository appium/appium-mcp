import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import { getElementAttribute } from '../../command.js';

export default function getElementAttributeTool(server: FastMCP): void {
  const schema = z.object({
    elementUUID: elementUUIDScheme,
    attribute: z
      .string()
      .describe(
        'The attribute name to retrieve. Common attributes: "enabled", "selected", "displayed", "checked", "focused", "clickable", "scrollable", "focusable", "name", "value", "label", "text", "content-desc", "resource-id", "class", "package".'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_get_element_attribute',
    description:
      'Get the value of an element attribute. Use this to check element state (enabled, selected, checked, focused, displayed, clickable) or read properties (name, value, label, content-desc, resource-id, class).',
    parameters: schema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const value = await getElementAttribute(
          driver,
          args.elementUUID,
          args.attribute
        );
        return {
          content: [
            {
              type: 'text',
              text:
                value !== null
                  ? `Attribute "${args.attribute}" of element ${args.elementUUID}: ${value}`
                  : `Attribute "${args.attribute}" is not set on element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get attribute "${args.attribute}" from element ${args.elementUUID}. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
