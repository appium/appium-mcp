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
      'get reads; set requires latitude + longitude; reset is unsupported on Android emulators.'
    ),
  latitude: z.coerce
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe('Latitude -90..90; required for set.'),
  longitude: z.coerce
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe('Longitude -180..180; required for set.'),
  altitude: z.coerce
    .number()
    .optional()
    .refine(
      (v) => v === undefined || !isNaN(v),
      'altitude must be a valid number'
    )
    .describe('Android set altitude meters; default 0.'),
  sessionId: z
    .string()
    .optional()
    .describe('Target session; defaults to active.'),
});

type GeolocationArgs = z.infer<typeof schema>;

export default function geolocation(server: FastMCP): void {
  server.addTool({
    name: 'appium_geolocation',
    description:
      'Get/set/reset device GPS on iOS and Android. Android emulators cannot reset; set coordinates instead.',
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

async function handleGet(args: GeolocationArgs): Promise<ContentResult> {
  const resolved = await resolveDriver(args.sessionId);
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
    return errorResult(
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
    return errorResult('latitude and longitude are required for action=set');
  }

  const resolved = await resolveDriver(args.sessionId);
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
    return errorResult(
      `Unsupported platform: ${platform}. Only Android and iOS are supported.`
    );
  }

  const altitudeText = altitude !== undefined ? `, altitude=${altitude}` : '';
  return textResult(
    `Successfully set geolocation to latitude=${latitude}, longitude=${longitude}${altitudeText}.`
  );
}

async function handleReset(args: GeolocationArgs): Promise<ContentResult> {
  const resolved = await resolveDriver(args.sessionId);
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
    return errorResult(
      `Unsupported platform: ${platform}. Only Android and iOS are supported.`
    );
  }

  return textResult('Successfully reset geolocation to default.');
}
