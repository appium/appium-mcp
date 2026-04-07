import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

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
    appPackage: z
      .string()
      .optional()
      .describe(
        'Android get/update: package to target. Defaults to the app under test.'
      ),
    bundleId: z
      .string()
      .optional()
      .describe(
        'iOS get/update: bundle id of the app. Required for iOS get and update.'
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
      'Manage mobile app permissions in one place. action=get: Android lists runtime permissions for a package; iOS Simulator reads one service state for a bundle id (needs bundleId + service). action=update: Android changes permissions (grant/revoke or AppOps); iOS Simulator sets privacy via access map (needs bundleId + access). action=reset: iOS only — resets one privacy service for the AUT (needs service).',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);

        if (args.action === 'get') {
          if (platform === PLATFORM.android) {
            const params: Record<string, unknown> = {};
            if (args.permissionFilter != null) {
              params.type = args.permissionFilter;
            }
            if (args.appPackage != null) {
              params.appPackage = args.appPackage;
            }
            const raw = await execute(driver, 'mobile: getPermissions', params);
            return {
              content: [{ type: 'text', text: JSON.stringify(raw, null, 2) }],
            };
          }
          if (platform === PLATFORM.ios) {
            if (!args.bundleId) {
              throw new Error(
                'iOS get requires bundleId and service (string).'
              );
            }
            if (
              args.service === undefined ||
              typeof args.service === 'number'
            ) {
              throw new Error(
                'iOS get requires service as a string name (e.g. camera, photos).'
              );
            }
            const raw = await execute(driver, 'mobile: getPermission', {
              bundleId: args.bundleId,
              service: args.service,
            });
            return {
              content: [{ type: 'text', text: String(raw) }],
            };
          }
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        if (args.action === 'update') {
          if (platform === PLATFORM.android) {
            if (args.permissions === undefined) {
              throw new Error('Android update requires permissions.');
            }
            const params: Record<string, unknown> = {
              permissions: args.permissions,
            };
            if (args.appPackage != null) {
              params.appPackage = args.appPackage;
            }
            if (args.permissionChangeAction != null) {
              params.action = args.permissionChangeAction;
            }
            if (args.target != null) {
              params.target = args.target;
            }
            await execute(driver, 'mobile: changePermissions', params);
            return {
              content: [
                { type: 'text', text: 'Permissions updated successfully.' },
              ],
            };
          }
          if (platform === PLATFORM.ios) {
            if (!args.bundleId || !args.access) {
              throw new Error('iOS update requires bundleId and access map.');
            }
            await execute(driver, 'mobile: setPermission', {
              bundleId: args.bundleId,
              access: args.access,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: 'Permission settings updated successfully.',
                },
              ],
            };
          }
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

        if (platform !== PLATFORM.ios) {
          throw new Error(
            'action=reset is only supported on iOS (mobile: resetPermission for the AUT).'
          );
        }
        if (args.service === undefined) {
          throw new Error('iOS reset requires service (name or numeric id).');
        }
        await execute(driver, 'mobile: resetPermission', {
          service: args.service,
        });
        return {
          content: [{ type: 'text', text: 'Permission reset successfully.' }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed permissions action ${args.action}. err: ${message}`,
            },
          ],
        };
      }
    },
  });
}
