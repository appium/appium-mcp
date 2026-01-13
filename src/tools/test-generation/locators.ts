/**
 * Tool to get page source from the Android session
 *
 * TOOL EXTENSION GUIDE:
 * This tool demonstrates the traditional approach where metadata is defined inline.
 *
 * ALTERNATIVE APPROACH: You can also use YAML metadata files for better separation.
 * See src/tools/metadata/ for examples and src/tools/scroll-with-yaml.example.ts
 *
 * For detailed documentation on adding tools, see docs/CONTRIBUTING.md
 */
import { z } from 'zod';
import { getDriver, isRemoteDriverSession } from '../../session-store.js';
import { generateAllElementLocators } from '../../locators/generate-all-locators.js';
import log from '../../logger.js';
import {
  createUIResource,
  createLocatorGeneratorUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import type { Client } from 'webdriver';

export default function generateLocators(server: any): void {
  server.addTool({
    name: 'generate_locators',
    description: `Generate locators for the current page.`,
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: any, { log }: any): Promise<any> => {
      log.info('Getting page source');
      try {
        // Check for active driver session

        const driver = getDriver();
        if (!driver) {
          throw new Error(
            'No active driver session. Please create a session first.'
          );
        }

        try {
          // Get the page source from the driver
          const pageSource = await (driver as any).getPageSource();
          const driverName = isRemoteDriverSession(driver)
            ? (driver as Client).capabilities[
                'appium:automationName'
              ]?.toLowerCase()
            : (await (driver as any).caps.automationName).toLowerCase();
          if (!pageSource) {
            throw new Error('Page source is empty or null');
          }
          const sampleXML = pageSource;
          const allElements = generateAllElementLocators(
            sampleXML,
            true,
            driverName
          );
          const interactableElements = generateAllElementLocators(
            sampleXML,
            true,
            driverName,
            {
              fetchableOnly: true,
            }
          );

          const textResponse = {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  interactableElements,
                  message: 'Page source retrieved successfully',
                  instruction: `This the locators for the current page. Use this to generate code for the current page.
                     Using the template provided by generate://code-with-locators resource.`,
                }),
              },
            ],
          };

          // Add interactive locator generator UI
          const uiResource = createUIResource(
            `ui://appium-mcp/locator-generator/${Date.now()}`,
            createLocatorGeneratorUI(interactableElements)
          );

          return addUIResourceToResponse(textResponse, uiResource);
        } catch (parseError: any) {
          log.error('Error parsing XML:', parseError);
          throw new Error(`Failed to parse XML: ${parseError.message}`);
        }
      } catch (error: any) {
        log.error('Error getting page source:', error);
        throw new Error(`Failed to get page source: ${error.message}`);
      }
    },
  });
}
