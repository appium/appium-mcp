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
        'get: Android list or iOS service state; update: Android permissions or iOS access map; reset: restore an iOS service prompt.'
      ),
    id: z
      .string()
      .optional()
      .describe(
        'Package/bundle ID; preferred over name. iOS get/update requires id or name.'
      ),
    name: z
      .string()
      .optional()
      .describe('App name resolved to ID; alternative to id.'),
    sessionId: z
      .string()
      .optional()
      .describe('Target session; defaults to active.'),
    permissionFilter: z
      .enum(['denied', 'granted', 'requested'])
      .optional()
      .describe('Android get bucket; default requested.'),
    service: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        'Required for iOS get/reset; get needs a service name, reset also accepts a numeric resource ID.'
      ),
    permissions: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Required for Android update: permission name(s), all, or appops names.'
      ),
    permissionChangeAction: z
      .string()
      .optional()
      .describe('Android update mode: pm grant/revoke or appops mode.'),
    target: z
      .enum(['pm', 'appops'])
      .optional()
      .describe('Android update: pm (default) or appops.'),
    access: z
      .record(z.string(), iosPermissionStateSchema)
      .optional()
      .describe(
        'Required for iOS update: service → yes|no|unset|limited map (Simulator).'
      ),
  });

  server.addTool({
    name: 'appium_mobile_permissions',
    description:
      'Get/update Android permissions or iOS Simulator privacy; reset is iOS-only. See action fields for required platform inputs.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = await resolveDriver(args.sessionId);
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
