import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';
import {
  createUIResource,
  createPageSourceInspectorUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { getPageSource as _getPageSource } from '../../command.js';

export default function getPageSource(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_page_source',
    description: 'Get the page source (XML) from the current screen',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found. Please create a session first.');
      }

      try {
        const pageSource = await _getPageSource(driver);
        if (!pageSource) {
          throw new Error('Page source is empty or null');
        }

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
