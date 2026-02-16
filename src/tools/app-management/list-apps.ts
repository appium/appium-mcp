import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isRemoteDriverSession,
  PLATFORM,
} from '../../session-store.js';
import {
  createUIResource,
  createAppListUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import { execute } from '../../command.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';

const PACKAGE_PREFIX = 'package:';

function normalizeListAppsResult(
  result: Record<string, Record<string, unknown> | undefined>
): { packageName: string; appName: string }[] {
  return Object.entries(result).map(([id, attrs]) => {
    let appName = '';
    if (attrs) {
      if (typeof attrs.CFBundleDisplayName === 'string') {
        appName = attrs.CFBundleDisplayName;
      } else if (typeof attrs.CFBundleName === 'string') {
        appName = attrs.CFBundleName;
      } else if (typeof (attrs as Record<string, unknown>).name === 'string') {
        appName = (attrs as Record<string, unknown>).name as string;
      }
    }
    return { packageName: id, appName };
  });
}

function parsePackageListOutput(
  raw: string
): { packageName: string; appName: string }[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(PACKAGE_PREFIX))
    .map((line) => ({
      packageName: line.slice(PACKAGE_PREFIX.length).trim(),
      appName: '',
    }));
}

async function listAppsFromDevice(): Promise<
  { packageName: string; appName: string }[]
> {
  const driver = await getDriver();
  if (!driver) {
    throw new Error('No driver found');
  }

  if (isRemoteDriverSession(driver)) {
    throw new Error('listApps is not yet implemented for the remote driver');
  }

  const platform = getPlatformName(driver);

  if (platform === PLATFORM.ios) {
    const result = await execute(driver, 'mobile: listApps', {});
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return normalizeListAppsResult(
        result as Record<string, Record<string, unknown> | undefined>
      );
    }
    return [];
  }

  if (platform === PLATFORM.android) {
    try {
      const result = await execute(driver, 'mobile: listApps', {});
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return normalizeListAppsResult(
          result as Record<string, Record<string, unknown> | undefined>
        );
      }
    } catch {}

    const adb = (driver as AndroidUiautomator2Driver).adb;
    let firstError: Error | null = null;

    try {
      const output = await adb.adbExec([
        'shell',
        'cmd',
        'package',
        'list',
        'packages',
      ]);
      return parsePackageListOutput(output);
    } catch (err) {
      firstError = err instanceof Error ? err : new Error(String(err));
    }

    try {
      const output = await adb.adbExec([
        'shell',
        'pm',
        'list',
        'packages',
        '--user',
        '0',
      ]);
      return parsePackageListOutput(output);
    } catch (err) {
      const secondError = err instanceof Error ? err : new Error(String(err));
      throw new Error(
        `listApps failed. First: ${firstError?.message ?? firstError}. ` +
          `Second: ${secondError.message}.`
      );
    }
  }

  throw new Error(`listApps is not implemented for platform: ${platform}`);
}

export default function listApps(server: FastMCP): void {
  const schema = z.object({});

  server.addTool({
    name: 'appium_list_apps',
    description: 'List all installed apps on the device.',
    parameters: schema,
    execute: async () => {
      try {
        const apps = await listAppsFromDevice();
        const textResponse = {
          content: [
            {
              type: 'text',
              text: `Installed apps: ${JSON.stringify(apps, null, 2)}`,
            },
          ],
        };

        const uiResource = createUIResource(
          `ui://appium-mcp/app-list/${Date.now()}`,
          createAppListUI(apps)
        );

        return addUIResourceToResponse(textResponse, uiResource);
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list apps. err: ${err.toString()}`,
            },
          ],
        };
      }
    },
  });
}
