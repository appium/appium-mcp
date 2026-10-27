import type {ContentResult, FastMCP} from 'fastmcp';
import type {z} from 'zod';

import {findElements as findMatchingElements} from '../../command.js';
import {evidenceContext, withEvidence} from '../evidence.js';
import {
  errorResult,
  readWebElementAttributes,
  readWebElementId,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';
import {findElementSchema, resolveLocatorSelector} from './find.js';

export default function findElements(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_elements',
    description:
      'Find all elements matching a strategy and selector. Returns JSON {elements: [{elementId, attributes?}]}; ' +
      'no matches returns {elements: []}. Pass an elementId as elementUUID to interaction tools. ' +
      'Additional driver attributes are preserved. For drivers supporting elementResponseAttributes, use ' +
      'appium_driver_settings to configure it with shouldUseCompactResponses=false. ' +
      'Use appium_find_element when only one match is needed.',
    parameters: findElementSchema,
    annotations: {readOnlyHint: true, openWorldHint: false},
    execute: async (args: z.infer<typeof findElementSchema>): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const evidence = {
        name: 'appium_find_elements',
        stage: 'locate' as const,
        startedAt: Date.now(),
        locator: {strategy: args.strategy, selector: args.selector},
        context: await evidenceContext(args.sessionId),
      };
      try {
        const resolvedSelector = await resolveLocatorSelector(args.strategy, args.selector);
        const result = await findMatchingElements(resolved.driver, args.strategy, resolvedSelector);
        if (!Array.isArray(result)) {
          throw new Error('Driver returned a non-array findElements response');
        }
        const elements = result.map((element) => {
          const elementId = readWebElementId(element);
          if (!elementId) {
            throw new Error('Element was returned without a valid element ID');
          }
          const attributes = readWebElementAttributes(element);
          return Object.keys(attributes).length > 0 ? {elementId, attributes} : {elementId};
        });
        return withEvidence(textResult(JSON.stringify({elements})), evidence);
      } catch (error: unknown) {
        return withEvidence(errorResult(`Failed to find elements. Error: ${toolErrorMessage(error)}`), {
          ...evidence,
          error,
        });
      }
    },
  });
}
