import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { generateAllElementLocators } from '../../locators/generate-all-locators.js';
import {
  DriverInstance,
  getPlatformName,
  PLATFORM,
} from '../../session-store.js';
import { elementClick, execute, getPageSource } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

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

export default function alert(server: FastMCP): void {
  const appiumAlertSchema = z.object({
    action: z
      .enum(['accept', 'dismiss', 'get_text'])
      .describe('Action to perform on alert: accept, dismiss, or get_text'),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
    buttonLabel: z
      .string()
      .optional()
      .describe('Optional label of the button to click for accept/dismiss.'),
  });

  server.addTool({
    name: 'appium_alert',
    description:
      'Handle system alerts with action=accept|dismiss, or read alert text with action=get_text.',
    parameters: appiumAlertSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof appiumAlertSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        if (args.action === 'get_text') {
          const text = await (driver as any).getAlertText();
          return textResult(
            text ? `Alert text: "${text}"` : 'Alert is present but has no text.'
          );
        }

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

        return textResult(
          `Successfully ${args.action}ed alert${
            args.buttonLabel ? ` with button "${args.buttonLabel}"` : ''
          }`
        );
      } catch (err: unknown) {
        const contextStr =
          args.action === 'get_text'
            ? 'action=get_text'
            : args.buttonLabel
              ? `action=${args.action}, buttonLabel="${args.buttonLabel}"`
              : `action=${args.action}`;
        return errorResult(
          `Failed alert action (${contextStr}). err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
