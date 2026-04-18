import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isXCUITestDriverSession,
  isRemoteDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import type { XCUITestDriver } from 'appium-xcuitest-driver';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const ANDROID_KEYCODE_MAP: Record<string, number> = {
  BACK: 4,
  HOME: 3,
  APP_SWITCH: 187,
};
const ANDROID_KEYS_DESCRIPTION = Object.keys(ANDROID_KEYCODE_MAP).join(', ');

const IOS_BUTTON_MAP: Record<string, string> = {
  HOME: 'home',
  VOLUME_UP: 'volumeup',
  VOLUME_DOWN: 'volumedown',
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  MENU: 'menu',
  PLAY_PAUSE: 'playpause',
  SELECT: 'select',
};
const IOS_BUTTONS_DESCRIPTION = Object.keys(IOS_BUTTON_MAP).join(', ');

export default function pressKey(server: FastMCP): void {
  const pressKeySchema = z
    .object({
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to target. If omitted, uses the active session.'),
      key: z
        .enum([
          'BACK',
          'HOME',
          'APP_SWITCH',
          'VOLUME_UP',
          'VOLUME_DOWN',
          'UP',
          'DOWN',
          'LEFT',
          'RIGHT',
          'MENU',
          'PLAY_PAUSE',
          'SELECT',
        ])
        .optional()
        .describe(
          `Logical key/button to press. On Android: ${ANDROID_KEYS_DESCRIPTION}. On iOS/tvOS: ${IOS_BUTTONS_DESCRIPTION}.`
        ),
      keyCode: z
        .number()
        .int()
        .optional()
        .describe(
          'Android keycode to press. If provided, takes precedence over key for Android.'
        ),
      isLongPress: z
        .boolean()
        .optional()
        .describe(
          'Android only. Whether to perform a long press. Defaults to false.'
        ),
    })
    .refine((value) => value.key !== undefined || value.keyCode !== undefined, {
      message: 'Either key or keyCode must be provided',
      path: ['key'],
    });

  server.addTool({
    name: 'appium_mobile_press_key',
    description:
      'Press navigation keys (BACK, HOME, APP_SWITCH) on Android or physical buttons (HOME, volume, etc.) on iOS/tvOS.',
    parameters: pressKeySchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof pressKeySchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      const platform = getPlatformName(driver);
      const { key, keyCode, isLongPress } = args;

      try {
        if (platform === PLATFORM.android) {
          const resolvedKeyCode =
            keyCode ?? (key && ANDROID_KEYCODE_MAP[key]) ?? undefined;

          if (resolvedKeyCode == null) {
            throw new Error(
              `For Android, provide either keyCode or key in [${ANDROID_KEYS_DESCRIPTION}].`
            );
          }

          if (isAndroidUiautomator2DriverSession(driver)) {
            await (driver as AndroidUiautomator2Driver).mobilePressKey(
              resolvedKeyCode,
              undefined,
              undefined,
              isLongPress ?? false
            );
          } else if (isRemoteDriverSession(driver)) {
            await execute(driver, 'mobile: pressKey', {
              keycode: resolvedKeyCode,
              isLongPress: isLongPress ?? false,
            });
          } else {
            throw new Error('Unsupported Android driver for press_key');
          }
        } else if (platform === PLATFORM.ios) {
          const logicalKey = key ?? 'HOME';
          const buttonName = IOS_BUTTON_MAP[logicalKey];

          if (!buttonName) {
            throw new Error(
              `For iOS/tvOS, key must be one of ${IOS_BUTTONS_DESCRIPTION}.`
            );
          }

          if (isXCUITestDriverSession(driver)) {
            await (driver as XCUITestDriver).mobilePressButton(
              buttonName as any
            );
          } else if (isRemoteDriverSession(driver)) {
            await execute(driver, 'mobile: pressButton', {
              name: buttonName,
            });
          } else {
            throw new Error('Unsupported iOS/tvOS driver for press_key');
          }
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return textResult(
          platform === PLATFORM.android
            ? `Successfully pressed key${key ? ` "${key}"` : ''} on Android.`
            : `Successfully pressed key${key ? ` "${key}"` : ''} on iOS/tvOS.`
        );
      } catch (err: unknown) {
        return errorResult(
          `Failed to press key${key ? ` "${key}"` : ''}. err: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
