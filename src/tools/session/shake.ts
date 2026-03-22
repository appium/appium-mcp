import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

function getMergedCapabilities(driver: unknown): Record<string, unknown> {
  const d = driver as {
    capabilities?: Record<string, unknown>;
    requestedCapabilities?: Record<string, unknown>;
  };
  const caps = d?.capabilities ?? {};
  const requested = d?.requestedCapabilities ?? {};
  return { ...requested, ...caps };
}

/**
 * XCUITest `mobile: shake` is for iOS Simulator only. We require the session
 * capabilities to already report a simulator (Appium sets `appium:isSimulator`
 * or `isSimulator` to true on Simulator sessions).
 */
function isIOSSimulatorFromCapabilities(driver: unknown): boolean {
  const caps = getMergedCapabilities(driver);
  const isSimulator = (caps as { isSimulator?: boolean }).isSimulator;
  return caps['appium:isSimulator'] === true || isSimulator === true;
}

export default function shakeDevice(server: FastMCP): void {
  const shakeSchema = z.object({});

  server.addTool({
    name: 'appium_mobile_shake',
    description:
      'Perform a shake gesture on the iOS Simulator via Appium `mobile: shake` ' +
      '(XCUITest). Not supported on Android. Physical iOS devices are not ' +
      'supported—use an iOS Simulator session only.',
    parameters: shakeSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      _args: z.infer<typeof shakeSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No driver found');
      }

      const platform = getPlatformName(driver);
      if (platform === PLATFORM.android) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Shake is not available on Android. This tool only supports ' +
                'iOS Simulator (XCUITest `mobile: shake`).',
            },
          ],
        };
      }

      if (
        platform === PLATFORM.ios &&
        !isIOSSimulatorFromCapabilities(driver)
      ) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Shake is only supported when the session capabilities report ' +
                'a Simulator (`appium:isSimulator` or `isSimulator` is true). ' +
                'Use an iOS Simulator session.',
            },
          ],
        };
      }

      try {
        await execute(driver, 'mobile: shake', {});
        return {
          content: [{ type: 'text', text: 'Shake action performed.' }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to perform shake. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}
