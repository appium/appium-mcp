import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  resolveDriver,
  textResultWithPrimaryElementId,
  errorResult,
  toolErrorMessage,
  readWebElementId,
} from '../tool-response.js';
import { withEvidence, evidenceContext } from '../evidence.js';
import { findElement as findSingleElement } from '../../command.js';

export const findElementSchema = z.object({
  strategy: z
    .enum([
      'accessibility id',
      'id',
      '-ios predicate string',
      '-ios class chain',
      '-android uiautomator',
      'xpath',
      'name',
      'class name',
      'css selector',
    ])
    .describe(
      'Prefer accessibility id (cross-platform, fastest, stable), then id. ' +
        'iOS: prefer -ios predicate/class chain; Android: prefer -android uiautomator. ' +
        'Use xpath last. CSS is webview-only; appium_ai handles natural language/vision.'
    ),
  selector: z
    .string()
    .describe(
      'Selector for strategy; not natural language (use appium_ai for that).'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description:
      'Find one element by strategy and selector; return its interaction UUID. ' +
      'Prefer accessibility id over id before xpath, which is a last resort. Use appium_gesture scroll_to_element off-screen and appium_ai find_element for vision/natural language.',
    parameters: findElementSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof findElementSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      const startedAt = Date.now();
      const locator = { strategy: args.strategy, selector: args.selector };
      const context = await evidenceContext(args.sessionId);
      try {
        const element = await findSingleElement(
          driver,
          args.strategy,
          args.selector
        );
        const elementId = readWebElementId(element);
        if (!elementId) {
          return withEvidence(
            errorResult('Element was returned without a valid element ID'),
            {
              name: 'appium_find_element',
              stage: 'locate',
              startedAt,
              locator,
              context,
            }
          );
        }
        return withEvidence(
          textResultWithPrimaryElementId(
            elementId,
            `Successfully found element ${args.selector} with strategy ${args.strategy}.`
          ),
          {
            name: 'appium_find_element',
            stage: 'locate',
            startedAt,
            locator,
            element: { webdriverId: elementId },
            context,
          }
        );
      } catch (err: unknown) {
        return withEvidence(
          errorResult(
            `Failed to find element. Error: ${toolErrorMessage(err)}`
          ),
          {
            name: 'appium_find_element',
            stage: 'locate',
            startedAt,
            locator,
            context,
            error: err,
          }
        );
      }
    },
  });
}
