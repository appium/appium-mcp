import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import { elementUUIDScheme } from '../../schema.js';
import {
  elementClick as _elementClick,
  performActions,
} from '../../command.js';
import log from '../../logger.js';

export default function generateTest(server: FastMCP): void {
  const clickActionSchema = z.object({
    elementUUID: elementUUIDScheme,
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_click',
    description:
      'Click on an element. Supports both traditional element UUIDs and AI-generated coordinate-based UUIDs.',
    parameters: clickActionSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof clickActionSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        // Check if this is an AI-generated coordinate-based UUID
        if (args.elementUUID.startsWith('ai-element:')) {
          // Parse format: "ai-element:{x},{y}:{bbox}"
          const parts = args.elementUUID.split(':');
          if (parts.length < 2) {
            throw new Error('Invalid AI element UUID format');
          }

          const coords = parts[1].split(',');
          if (coords.length < 2) {
            throw new Error('Invalid AI element coordinates format');
          }

          const x = parseInt(coords[0], 10);
          const y = parseInt(coords[1], 10);

          if (isNaN(x) || isNaN(y)) {
            throw new Error('Invalid AI element coordinates: not numbers');
          }

          log.info(`Clicking at AI-detected coordinates: (${x}, ${y})`);

          // Use W3C Actions API for coordinate-based tap (cross-platform)
          // Reference: double-tap.ts implementation
          const operation = [
            {
              type: 'pointer',
              id: 'finger1',
              parameters: { pointerType: 'touch' },
              actions: [
                { type: 'pointerMove', duration: 0, x, y },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 50 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ];

          await performActions(driver, operation);

          return {
            content: [
              {
                type: 'text',
                text: `Successfully clicked at coordinates (${x}, ${y}) using AI-found element`,
              },
            ],
          };
        }

        // Traditional element click
        await _elementClick(driver, args.elementUUID);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully clicked on element ${args.elementUUID}`,
            },
          ],
        };
      } catch (err: any) {
        const errorMessage = err.message || err.toString();
        log.error('Failed to click element:', errorMessage);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to click on element ${args.elementUUID}. err: ${errorMessage}`,
            },
          ],
        };
      }
    },
  });
}
