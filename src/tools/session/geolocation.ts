import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const schema = z.object({
  action: z
    .enum(['get', 'set', 'reset'])
    .describe(
      'Action to perform. ' +
        'get: read the current device geolocation. ' +
        'set: set the device geolocation (requires latitude and longitude; optional altitude for Android). ' +
        'reset: reset the geolocation to the default/system value. Not supported on Android emulators — use action=set instead.'
    ),
  latitude: z.coerce
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe(
      'Latitude value (-90 to 90). Measurement of distance north or south of the Equator. Required for: set.'
    ),
  longitude: z.coerce
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe(
      'Longitude value (-180 to 180). Measurement of distance east or west of the prime meridian. Required for: set.'
    ),
  altitude: z.coerce
    .number()
    .optional()
    .refine(
      (v) => v === undefined || !isNaN(v),
      'altitude must be a valid number'
    )
    .describe(
      'Altitude value in meters. Android only, defaults to 0. Ignored on iOS. Used with: set.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

type GeolocationArgs = z.infer<typeof schema>;

async function handleGet(args: GeolocationArgs): Promise<ContentResult> {
  const resolved = resolveDriver(args.sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

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

  const altitudeText =
    result.altitude !== undefined ? `, altitude=${result.altitude}` : '';
  return textResult(
    `Current geolocation: latitude=${result.latitude}, longitude=${result.longitude}${altitudeText}.`
  );
}

async function handleSet(args: GeolocationArgs): Promise<ContentResult> {
  if (args.latitude === undefined || args.longitude === undefined) {
    throw new Error('latitude and longitude are required for action=set');
  }

  const resolved = resolveDriver(args.sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

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

  const altitudeText = altitude !== undefined ? `, altitude=${altitude}` : '';
  return textResult(
    `Successfully set geolocation to latitude=${latitude}, longitude=${longitude}${altitudeText}.`
  );
}

async function handleReset(args: GeolocationArgs): Promise<ContentResult> {
  const resolved = resolveDriver(args.sessionId);
  if (!resolved.ok) {
    return resolved.result;
  }
  const { driver } = resolved;

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

  return textResult('Successfully reset geolocation to default.');
}

export default function geolocation(server: FastMCP): void {
  server.addTool({
    name: 'appium_geolocation',
    description:
      'Get, set, or reset the device geolocation (GPS coordinates). Works on both iOS (simulators and real devices) and Android (emulators and real devices with mock location enabled). Use action=get to read current coordinates, action=set with latitude/longitude (and optional altitude for Android) to simulate a location, or action=reset to restore the system default. Note: On Android emulators, reset is not supported — use action=set to manually restore coordinates instead. On Android real devices, the mocked location may persist until the GPS cache refreshes.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: GeolocationArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      try {
        switch (args.action) {
          case 'get':
            return await handleGet(args);
          case 'set':
            return await handleSet(args);
          case 'reset':
            return await handleReset(args);
        }
      } catch (err: unknown) {
        return errorResult(
          `Failed to ${args.action} geolocation. Error: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
