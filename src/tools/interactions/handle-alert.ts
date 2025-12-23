import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver, getPlatformName } from '../../session-store.js';

async function handleAndroidAlert(
  driver: any,
  action: string,
  buttonLabel?: string
): Promise<void> {
  if (buttonLabel) {
    const resourceIdMap: Record<string, string> = {
      'While using the app':
        'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
      'Only this time':
        'com.android.permissioncontroller:id/permission_allow_one_time_button',
      "Don't allow":
        'com.android.permissioncontroller:id/permission_deny_and_dont_ask_again_button',
    };

    let button;
    const resourceId = resourceIdMap[buttonLabel];
    if (resourceId) {
      try {
        button = await driver.findElement('id', resourceId);
      } catch {
        button = await driver.findElement(
          'xpath',
          `//android.widget.Button[contains(@text, "${buttonLabel}")]`
        );
      }
    } else {
      button = await driver.findElement(
        'xpath',
        `//android.widget.Button[contains(@text, "${buttonLabel}")]`
      );
    }

    const buttonUUID = button.ELEMENT || button;
    await driver.click(buttonUUID);
  } else {
    if (action === 'accept') {
      await driver.execute('mobile: acceptAlert', {});
    } else {
      await driver.execute('mobile: dismissAlert', {});
    }
  }
}

async function handleiOSAlert(
  driver: any,
  action: string,
  buttonLabel?: string
): Promise<void> {
  const params: any = { action };
  if (buttonLabel) {
    params.buttonLabel = buttonLabel;
  }
  await driver.execute('mobile: alert', params);
}

export default function handleAlert(server: FastMCP): void {
  const handleAlertSchema = z.object({
    action: z
      .enum(['accept', 'dismiss'])
      .describe('Action to perform on the alert: accept or dismiss'),
    buttonLabel: z.string().optional()
      .describe(`Optional label of the button to click. Common permission dialog buttons:
Android: "While using the app", "Only this time", "Don't allow"
iOS: "Always" or "Allow Always", "Once" or "Allow Once", "Don't allow"
Standard: "OK", "Cancel", "Allow", "Deny"
If not provided, uses default button based on action.`),
  });

  server.addTool({
    name: 'appium_handle_alert',
    description: `Handle system alerts or dialogs that do not belong to the app.
Use this to dismiss or accept alerts programmatically instead of using autoDismissAlerts capability.
Supports permission dialogs with buttons like:
- Android: "While using the app", "Only this time", "Don't allow"
- iOS: "Always", "Allow Once", "Don't allow"
For iOS: Uses mobile: alert execute command.
For Android: Uses mobile: acceptAlert/dismissAlert or finds button by text label.
If no alert is present, the error is caught and returned gracefully.`,
    parameters: handleAlertSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);

        if (platform === 'Android') {
          await handleAndroidAlert(driver, args.action, args.buttonLabel);
        } else if (platform === 'iOS') {
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
        return {
          content: [
            {
              type: 'text',
              text: `Failed to handle alert. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
