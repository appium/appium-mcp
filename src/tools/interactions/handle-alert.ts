import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { generateAllElementLocators } from '../../locators/generate-all-locators.js';
import { DriverInstance, getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { elementClick, execute, getPageSource } from '../../command.js';

export const handleAlertSchema = z.object({
  action: z
    .enum(['accept', 'dismiss'])
    .describe('Action to perform on the alert: accept or dismiss'),
  buttonLabel: z
    .string()
    .optional()
    .describe(
      `Optional label of the button to click. Common permission dialog buttons:
Android: "While using the app", "Only this time", "Don't allow"
iOS: "Always" or "Allow Always", "Once" or "Allow Once", "Don't allow"
Standard: "OK", "Cancel", "Allow", "Deny"
If not provided, uses default button based on action.
Use appium_get_page_source or generate_locators to inspect the screen and discover exact labels.`
    ),
});

const ANDROID_LOCATOR_STRATEGY_ORDER = [
  'id',
  'accessibility id',
  'xpath',
  '-android uiautomator',
  'class name',
];

async function handleAndroidAlert(
  driver: DriverInstance,
  action: string,
  buttonLabel?: string
): Promise<void> {
  if (buttonLabel) {
    const pageSource = await getPageSource(driver);
    const elements = generateAllElementLocators(
      pageSource,
      true,
      'uiautomator2',
      {
        fetchableOnly: true,
      }
    );
    const normalizedLabel = buttonLabel.trim();
    const match =
      elements.find(
        (el) =>
          (el.text?.trim() === normalizedLabel ||
            el.contentDesc?.trim() === normalizedLabel) &&
          el.clickable
      ) ??
      elements.find(
        (el) =>
          el.text?.trim() === normalizedLabel ||
          el.contentDesc?.trim() === normalizedLabel
      );

    if (!match) {
      throw new Error(
        `No element found with text or content-desc "${buttonLabel}"`
      );
    }

    let button: any = null;
    for (const strategy of ANDROID_LOCATOR_STRATEGY_ORDER) {
      const selector = match.locators[strategy];
      if (!selector) {
        continue;
      }
      try {
        button = await driver.findElement(strategy, selector);
        break;
      } catch {
        continue;
      }
    }
    if (!button) {
      throw new Error(
        'Could not find element with any generated locator; it may have disappeared'
      );
    }
    const buttonUUID = button.ELEMENT || button;
    await elementClick(driver, buttonUUID);
  } else {
    if (action === 'accept') {
      await execute(driver, 'mobile: acceptAlert', {});
    } else {
      await execute(driver, 'mobile: dismissAlert', {});
    }
  }
}

async function handleiOSAlert(
  driver: DriverInstance,
  action: string,
  buttonLabel?: string
): Promise<void> {
  const params: any = { action };
  if (buttonLabel) {
    params.buttonLabel = buttonLabel;
  }
  await execute(driver, 'mobile: alert', params);
}

export default function handleAlert(server: FastMCP): void {
  server.addTool({
    name: 'appium_handle_alert',
    description: `Handle system alerts or dialogs that do not belong to the app.
Use this to dismiss or accept alerts programmatically instead of using autoDismissAlerts capability.
Supports permission dialogs with buttons like:
- Android: "While using the app", "Only this time", "Don't allow"
- iOS: "Always", "Allow Once", "Don't allow"
For iOS: Uses mobile: alert execute command.
For Android: Uses mobile: acceptAlert/dismissAlert or searches the current page source for an element whose text or content-desc matches the label, then uses generated locators to find and click it (no hardcoded resource IDs or XPaths).
If no alert is present, the error is caught and returned gracefully.
To discover button labels and screen structure first, use appium_get_page_source (XML hierarchy) or generate_locators (interactable elements with text/content-desc).`,
    parameters: handleAlertSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, _context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);

        if (platform === PLATFORM.android) {
          await handleAndroidAlert(driver, args.action, args.buttonLabel);
        } else if (platform === PLATFORM.ios) {
          await handleiOSAlert(driver, args.action, args.buttonLabel);
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully ${args.action}ed alert${
                args.buttonLabel ? ` with button "${args.buttonLabel}"` : ''
              }`,
            },
          ],
        };
      } catch (err: any) {
        const contextStr = args.buttonLabel
          ? `action=${args.action}, buttonLabel="${args.buttonLabel}"`
          : `action=${args.action}`;
        return {
          content: [
            {
              type: 'text',
              text: `Failed to handle alert (${contextStr}). err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
