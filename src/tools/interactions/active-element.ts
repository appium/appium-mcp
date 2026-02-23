import type { ContentResult, FastMCP } from 'fastmcp';
import { getDriver } from '../../session-store.js';
import { getActiveElement as _getActiveElement } from '../../command.js';

export default function getActiveElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_get_active_element',
    description:
      'Get the currently active element and return its UUID for follow-up interactions',
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

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

        return {
          content: [
            {
              type: 'text',
              text: `Successfully found an active element. Element id: ${elementId}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to find an active element. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
