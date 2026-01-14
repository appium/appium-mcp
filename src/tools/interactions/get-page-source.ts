import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import {
  createUIResource,
  createPageSourceInspectorUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { filterPageSource } from '../../utils/page-source-filter.js';

export default function getPageSource(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_page_source',
    description: `Get the page source from the current screen.
      For Android: Returns filtered JSON with interactive elements and their locators (strategy + selector for appium_find_element).
      For iOS: Returns raw XML.
      Use raw=true to get unfiltered XML on any platform.`,
    parameters: z.object({
      raw: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, return raw XML instead of filtered JSON (default: false)'
        ),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const { raw = false } = args;
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found. Please create a session first.');
      }

      try {
        const pageSource = await driver.getPageSource();

        if (!pageSource) {
          throw new Error('Page source is empty or null');
        }

        // Check if we should apply filtering (Android only, and raw=false)
        const isAndroid = getPlatformName(driver) === PLATFORM.android;

        if (!raw && isAndroid) {
          // Return filtered JSON for Android
          const filtered = filterPageSource(pageSource);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(filtered, null, 2),
              },
            ],
          };
        }

        // Return raw XML for iOS or when raw=true
        const textResponse = {
          content: [
            {
              type: 'text',
              text:
                'Page source retrieved successfully: \n' +
                '```xml ' +
                pageSource +
                '```',
            },
          ],
        };

        // Add interactive page source inspector UI
        const uiResource = createUIResource(
          `ui://appium-mcp/page-source-inspector/${Date.now()}`,
          createPageSourceInspectorUI(pageSource)
        );

        return addUIResourceToResponse(textResponse, uiResource);
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get page source. Error: ${err.toString()}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
