import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

export function setGeolocation(server: FastMCP): void {
  const setGeolocationSchema = z.object({
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe(
        'Latitude value (-90 to 90). Measurement of distance north or south of the Equator.'
      ),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe(
        'Longitude value (-180 to 180). Measurement of distance east or west of the prime meridian.'
      ),
    altitude: z
      .number()
      .optional()
      .describe('Altitude value in meters. Android only. Defaults to 0.'),
  });

  server.addTool({
    name: 'appium_set_geolocation',
    description:
      'Set the geolocation (GPS coordinates) of the device. Works on both iOS (simulators and real devices) and Android (emulators and real devices with mock location enabled).',
    parameters: setGeolocationSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof setGeolocationSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
        const { latitude, longitude, altitude } = args;

        if (platform === PLATFORM.ios) {
          await execute(driver, 'mobile: setSimulatedLocation', {
            latitude,
            longitude,
          });
        } else if (platform === PLATFORM.android) {
          await execute(driver, 'mobile: setGeolocation', {
            latitude,
            longitude,
            ...(altitude !== undefined && { altitude }),
          });
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully set geolocation to latitude=${latitude}, longitude=${longitude}${altitude !== undefined ? `, altitude=${altitude}` : ''}.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to set geolocation. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}

export function getGeolocation(server: FastMCP): void {
  const getGeolocationSchema = z.object({
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_get_geolocation',
    description:
      'Get the current geolocation (GPS coordinates) of the device. Returns latitude, longitude, and altitude.',
    parameters: getGeolocationSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof getGeolocationSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
        let result: Record<string, any>;

        if (platform === PLATFORM.ios) {
          result = await execute(driver, 'mobile: getSimulatedLocation', {});
        } else if (platform === PLATFORM.android) {
          result = await execute(driver, 'mobile: getGeolocation', {});
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Current geolocation: latitude=${result.latitude}, longitude=${result.longitude}${result.altitude !== undefined ? `, altitude=${result.altitude}` : ''}.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get geolocation. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}

export function resetGeolocation(server: FastMCP): void {
  const resetGeolocationSchema = z.object({
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_reset_geolocation',
    description:
      'Reset the geolocation to the default/system value. On iOS, resets the simulated location. On Android real devices, resets the mocked geolocation provider (note: GPS cache behavior varies by device — the mocked location may persist until the cache refreshes). On Android emulators, reset is not supported — use appium_set_geolocation to manually set the desired coordinates instead.',
    parameters: resetGeolocationSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof resetGeolocationSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);

        if (platform === PLATFORM.ios) {
          await execute(driver, 'mobile: resetSimulatedLocation', {});
        } else if (platform === PLATFORM.android) {
          await execute(driver, 'mobile: resetGeolocation', {});
          // Refresh GPS cache
          await execute(driver, 'mobile: refreshGpsCache', {});
        } else {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Successfully reset geolocation to default.',
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to reset geolocation. Error: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
