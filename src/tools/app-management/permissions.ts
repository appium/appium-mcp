import type { ContentResult } from 'fastmcp';
import { z } from 'zod';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { execute } from '../../command.js';

export const iosPermissionStateSchema = z.enum([
  'yes',
  'no',
  'unset',
  'limited',
]);

export async function getPermissions(
  args: {
    appId?: string;
    permissionFilter?: 'denied' | 'granted' | 'requested';
    service?: string | number;
  },
  sessionId?: string
): Promise<ContentResult> {
  const driver = getDriver(sessionId);
  if (!driver) {
    return { content: [{ type: 'text', text: 'No driver found' }] };
  }

  const platform = getPlatformName(driver);

  if (platform === PLATFORM.android) {
    const params: Record<string, unknown> = {};
    if (args.permissionFilter != null) {
      params.type = args.permissionFilter;
    }
    if (args.appId != null) {
      params.appPackage = args.appId;
    }
    const raw = await execute(driver, 'mobile: getPermissions', params);
    return { content: [{ type: 'text', text: JSON.stringify(raw, null, 2) }] };
  }

  if (platform === PLATFORM.ios) {
    if (!args.appId) {
      return {
        content: [
          {
            type: 'text',
            text: 'iOS get requires id or name and service (string).',
          },
        ],
      };
    }
    if (args.service === undefined || typeof args.service === 'number') {
      return {
        content: [
          {
            type: 'text',
            text: 'iOS get requires service as a string name (e.g. camera, photos).',
          },
        ],
      };
    }
    const raw = await execute(driver, 'mobile: getPermission', {
      bundleId: args.appId,
      service: args.service,
    });
    return { content: [{ type: 'text', text: String(raw) }] };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unsupported platform: ${platform}. Only Android and iOS are supported.`,
      },
    ],
  };
}

export async function updatePermissions(
  args: {
    appId?: string;
    permissions?: string | string[];
    permissionChangeAction?: string;
    target?: 'pm' | 'appops';
    access?: Record<string, 'yes' | 'no' | 'unset' | 'limited'>;
  },
  sessionId?: string
): Promise<ContentResult> {
  const driver = getDriver(sessionId);
  if (!driver) {
    return { content: [{ type: 'text', text: 'No driver found' }] };
  }

  const platform = getPlatformName(driver);

  if (platform === PLATFORM.android) {
    if (args.permissions === undefined) {
      return {
        content: [
          { type: 'text', text: 'Android update requires permissions.' },
        ],
      };
    }
    const params: Record<string, unknown> = { permissions: args.permissions };
    if (args.appId != null) {
      params.appPackage = args.appId;
    }
    if (args.permissionChangeAction != null) {
      params.action = args.permissionChangeAction;
    }
    if (args.target != null) {
      params.target = args.target;
    }
    await execute(driver, 'mobile: changePermissions', params);
    return {
      content: [{ type: 'text', text: 'Permissions updated successfully.' }],
    };
  }

  if (platform === PLATFORM.ios) {
    if (!args.appId || !args.access) {
      return {
        content: [
          {
            type: 'text',
            text: 'iOS update requires id or name and access map.',
          },
        ],
      };
    }
    await execute(driver, 'mobile: setPermission', {
      bundleId: args.appId,
      access: args.access,
    });
    return {
      content: [
        { type: 'text', text: 'Permission settings updated successfully.' },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unsupported platform: ${platform}. Only Android and iOS are supported.`,
      },
    ],
  };
}

export async function resetPermissions(
  args: { service?: string | number },
  sessionId?: string
): Promise<ContentResult> {
  const driver = getDriver(sessionId);
  if (!driver) {
    return { content: [{ type: 'text', text: 'No driver found' }] };
  }

  const platform = getPlatformName(driver);

  if (platform !== PLATFORM.ios) {
    return {
      content: [{ type: 'text', text: 'reset is only supported on iOS.' }],
    };
  }
  if (args.service === undefined) {
    return {
      content: [
        {
          type: 'text',
          text: 'iOS reset requires service (name or numeric id).',
        },
      ],
    };
  }
  await execute(driver, 'mobile: resetPermission', { service: args.service });
  return {
    content: [{ type: 'text', text: 'Permission reset successfully.' }],
  };
}
