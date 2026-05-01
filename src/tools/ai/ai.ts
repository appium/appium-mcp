import type { ContentResult, FastMCP } from 'fastmcp';
import { resolveDriver } from '../tool-response.js';
import { AI_ACTIONS, aiSchema, type AIArgs } from './schema.js';
import { handleFindElement } from './handlers/find-element.js';

export default function ai(server: FastMCP): void {
  server.addTool({
    name: 'appium_ai',
    description:
      `Vision-based AI capabilities (FALLBACK - use only when traditional tools cannot locate the element). ` +
      `Use 'action' to choose: ${AI_ACTIONS.join(', ')}. ` +
      `find_element: locate an element from a natural-language description; returns a coordinate UUID (ai-element:x,y:bbox) usable with appium_gesture. ` +
      `Prefer appium_find_element with xpath/id/accessibility id/text first. ` +
      `Reach for this tool only when the element has no stable identifier, the page source is unavailable, or you need to locate by purely visual cues (color, position, icon).`,
    parameters: aiSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
    execute: async (
      args: AIArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      switch (args.action) {
        case 'find_element':
          return handleFindElement(driver, args);
      }
    },
  });
}
