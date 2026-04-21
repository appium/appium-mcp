import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';
import { resolveAppId } from './resolve-app-id.js';
import {
  resolveDriver,
  textResult,
  errorResult,
  toolErrorMessage,
} from '../tool-response.js';

const iosPermissionStateSchema = z.enum(['yes', 'no', 'unset', 'limited']);

export default function mobilePermissions(server: FastMCP): void {
  const schema = z.object({
    action: z
      .enum(['get', 'update', 'reset'])
      .describe(
        'get: list (Android) or read one privacy state (iOS Simulator). ' +
          'update: grant/revoke (Android) or set privacy map (iOS Simulator). ' +
          'reset: restore a privacy prompt for the app under test (iOS only).'
      ),
    id: z
      .string()
      .optional()
      .describe(
        'App identifier (package name for Android, bundle ID for iOS). Takes precedence over name. ' +
          'Optional for Android (defaults to the app under test). Required for iOS get and update.'
      ),
    name: z
      .string()
      .optional()
      .describe(
        'Human-readable app name (e.g. "Spotify"). Used to resolve the app id. ' +
          'Optional for Android (defaults to the app under test). Required (as alternative to id) for iOS get and update.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Session ID to target. If omitted, uses the active session.'),
    permissionFilter: z
      .enum(['denied', 'granted', 'requested'])
      .optional()
      .describe(
        'Android get only: which bucket to return. Defaults to requested per UiAutomator2.'
      ),
    service: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        'iOS get: privacy service name (e.g. camera, microphone, photos). ' +
          'iOS reset: service name or numeric XCUIProtectedResource id.'
      ),
    permissions: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Android update only: permission name(s), `all` (with pm target), or appops names. Required for Android update.'
      ),
    permissionChangeAction: z
      .string()
      .optional()
      .describe(
        'Android update: for pm target grant (default) or revoke; for appops allow, deny, ignore, default.'
      ),
    target: z
      .enum(['pm', 'appops'])
      .optional()
      .describe('Android update: pm (default) or appops.'),
    access: z
      .record(z.string(), iosPermissionStateSchema)
      .optional()
      .describe(
        'iOS update only: map of access rule → yes|no|unset|limited (Simulator + AppleSimulatorUtils). Required for iOS update.'
      ),
  });

  server.addTool({
    name: 'appium_mobile_permissions',
    description:
      'Manage mobile app permissions in one place. action=get: Android lists runtime permissions for a package; iOS Simulator reads one service state for an app (needs id or name + service). action=update: Android changes permissions (grant/revoke or AppOps); iOS Simulator sets privacy via access map (needs id or name + access). action=reset: iOS only — resets one privacy service for the AUT (needs service).',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      try {
        const platform = getPlatformName(driver);
        const appId =
          args.id ??
          (args.name
            ? await resolveAppId(args.name, args.sessionId)
            : undefined);

        if (args.action === 'get') {
          if (platform === PLATFORM.android) {
            const params: Record<string, unknown> = {};
            if (args.permissionFilter != null) {
              params.type = args.permissionFilter;
            }
            if (appId != null) {
              params.appPackage = appId;
            }
            const raw = await execute(driver, 'mobile: getPermissions', params);
            return textResult(JSON.stringify(raw, null, 2));
          }
          if (platform === PLATFORM.ios) {
            if (!appId) {
              return errorResult(
                'iOS get requires id or name and service (string).'
              );
            }
            if (
              args.service === undefined ||
              typeof args.service === 'number'
            ) {
              return errorResult(
                'iOS get requires service as a string name (e.g. camera, photos).'
              );
            }
            const raw = await execute(driver, 'mobile: getPermission', {
              bundleId: appId,
              service: args.service,
            });
            return textResult(String(raw));
          }
          return errorResult(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        if (args.action === 'update') {
          if (platform === PLATFORM.android) {
            if (args.permissions === undefined) {
              return errorResult('Android update requires permissions.');
            }
            const params: Record<string, unknown> = {
              permissions: args.permissions,
            };
            if (appId != null) {
              params.appPackage = appId;
            }
            if (args.permissionChangeAction != null) {
              params.action = args.permissionChangeAction;
            }
            if (args.target != null) {
              params.target = args.target;
            }
            await execute(driver, 'mobile: changePermissions', params);
            return textResult('Permissions updated successfully.');
          }
          if (platform === PLATFORM.ios) {
            if (!appId || !args.access) {
              return errorResult(
                'iOS update requires id or name and access map.'
              );
            }
            await execute(driver, 'mobile: setPermission', {
              bundleId: appId,
              access: args.access,
            });
            return textResult('Permission settings updated successfully.');
          }
          return errorResult(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        // action === 'reset'
        if (platform !== PLATFORM.ios) {
          return errorResult(
            'action=reset is only supported on iOS (mobile: resetPermission for the AUT).'
          );
        }
        if (args.service === undefined) {
          return errorResult(
            'iOS reset requires service (name or numeric id).'
          );
        }
        await execute(driver, 'mobile: resetPermission', {
          service: args.service,
        });
        return textResult('Permission reset successfully.');
      } catch (err: unknown) {
        return errorResult(
          `Failed permissions action ${args.action}: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
