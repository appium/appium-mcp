/**
 * Single-call tool to prepare an iOS simulator for Appium testing.
 * Chains: boot simulator → download WDA → install & launch WDA.
 * Each step checks preconditions and skips if already satisfied.
 */
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { access, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import { Simctl } from 'node-simctl';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';

const execAsync = promisify(exec);

type StepStatus = 'completed' | 'skipped' | 'failed';

interface StepResult {
  status: StepStatus;
  detail: string;
}

interface PrepareResult {
  boot: StepResult;
  wda_download: StepResult;
  wda_install: StepResult;
  ready: boolean;
  udid: string;
  wdaAppPath?: string;
}

function cachePath(folder: string): string {
  return path.join(os.homedir(), '.cache', 'appium-mcp', folder);
}

// ── WDA download helpers ──

async function getLatestWDAVersionFromGitHub(): Promise<string> {
  const response = await fetch(
    'https://api.github.com/repos/appium/WebDriverAgent/releases/latest',
    {
      headers: {
        'User-Agent': 'mcp-appium',
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch WDA version: ${response.status} ${response.statusText}`
    );
  }

  const release = (await response.json()) as { tag_name?: string };
  if (release.tag_name) {
    return release.tag_name.replace(/^v/, '');
  }

  throw new Error('No tag_name found in release data');
}

async function cleanupFile(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.F_OK);
    await unlink(filePath);
  } catch {
    // File doesn't exist or already deleted
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download: ${response.status} ${response.statusText}`
      );
    }

    const writer = createWriteStream(destPath);
    const stream = Readable.fromWeb(
      response.body as unknown as NodeReadableStream<Uint8Array>
    );

    try {
      await pipeline(stream, writer);
    } catch (streamError: any) {
      writer.close();
      await cleanupFile(destPath);
      throw streamError;
    }
  } catch (error: any) {
    await cleanupFile(destPath);
    throw error;
  }
}

async function unzipFile(zipPath: string, destDir: string): Promise<void> {
  await execAsync(`unzip -q "${zipPath}" -d "${destDir}"`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getLatestWDAVersionFromCache(): Promise<string | null> {
  const wdaCacheDir = cachePath('wda');

  if (!(await fileExists(wdaCacheDir))) {
    return null;
  }

  const entries = await readdir(wdaCacheDir);
  const versions = await Promise.all(
    entries.map(async (dir) => {
      const dirPath = path.join(wdaCacheDir, dir);
      const stats = await stat(dirPath);
      return stats.isDirectory() ? dir : null;
    })
  );

  const filteredVersions = versions
    .filter((v): v is string => v !== null)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return filteredVersions.length > 0 ? filteredVersions[0] : null;
}

// ── WDA install helpers ──

async function installAppOnSimulator(
  appPath: string,
  simulatorUdid: string
): Promise<void> {
  await execAsync(`xcrun simctl install "${simulatorUdid}" "${appPath}"`);
}

async function launchAppOnSimulator(
  bundleId: string,
  simulatorUdid: string
): Promise<void> {
  await execAsync(`xcrun simctl launch "${simulatorUdid}" "${bundleId}"`);
}

async function getAppBundleId(appPath: string): Promise<string> {
  const { stdout } = await execAsync(
    `/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "${path.join(appPath, 'Info.plist')}"`
  );
  return stdout.trim();
}

async function isWDAInstalled(simulatorUdid: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `xcrun simctl listapps "${simulatorUdid}" --json`
    );
    const data = JSON.parse(stdout);

    for (const [bundleId, appInfo] of Object.entries(data)) {
      if (
        bundleId.includes('WebDriverAgentRunner') ||
        (appInfo as any)?.CFBundleName?.includes('WebDriverAgent')
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function isWDARunning(simulatorUdid: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `xcrun simctl listapps "${simulatorUdid}" --json`
    );
    const data = JSON.parse(stdout);

    for (const [bundleId, appInfo] of Object.entries(data)) {
      if (
        bundleId.includes('WebDriverAgentRunner') &&
        (appInfo as any)?.ApplicationType === 'User'
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ── Main pipeline ──

async function prepareSimulator(
  udid: string,
  platform: string,
  skipWda: boolean,
  forceRefreshWda: boolean
): Promise<PrepareResult> {
  const result: PrepareResult = {
    boot: { status: 'skipped', detail: '' },
    wda_download: { status: 'skipped', detail: '' },
    wda_install: { status: 'skipped', detail: '' },
    ready: false,
    udid,
  };

  // ── Step 1: Boot simulator ──
  try {
    const iosManager = IOSManager.getInstance();
    const simulators = await iosManager.listSimulators();
    const simulator = simulators.find((sim) => sim.udid === udid);

    if (!simulator) {
      result.boot = {
        status: 'failed',
        detail: `Simulator with UDID "${udid}" not found. Use select_platform and select_device to get a valid UDID.`,
      };
      return result;
    }

    if (simulator.state === 'Booted') {
      result.boot = {
        status: 'skipped',
        detail: `${simulator.name} is already booted`,
      };
    } else {
      log.info(`Booting simulator ${simulator.name} (${udid})...`);
      const simctl = new Simctl();
      simctl.udid = udid;
      await simctl.bootDevice();
      await simctl.startBootMonitor({ timeout: 120000 });
      result.boot = {
        status: 'completed',
        detail: `${simulator.name} booted successfully`,
      };
    }
  } catch (error: any) {
    result.boot = { status: 'failed', detail: error.message };
    return result;
  }

  if (skipWda) {
    result.wda_download = { status: 'skipped', detail: 'skipWda=true' };
    result.wda_install = { status: 'skipped', detail: 'skipWda=true' };
    result.ready = true;
    return result;
  }

  // ── Step 2: Download WDA ──
  let wdaAppPath: string;
  try {
    const arch = os.arch();
    const archStr = arch === 'arm64' ? 'arm64' : 'x86_64';

    // Check cache first (unless force refresh)
    if (!forceRefreshWda) {
      const cachedVersion = await getLatestWDAVersionFromCache();
      if (cachedVersion) {
        const cachedAppPath = path.join(
          cachePath(`wda/${cachedVersion}/extracted`),
          'WebDriverAgentRunner-Runner.app'
        );
        if (await fileExists(cachedAppPath)) {
          wdaAppPath = cachedAppPath;
          result.wda_download = {
            status: 'skipped',
            detail: `WDA v${cachedVersion} already cached at ${cachedAppPath}`,
          };
          result.wdaAppPath = wdaAppPath;

          // Jump to install step
          await installWdaStep(result, udid, wdaAppPath);
          return result;
        }
      }
    }

    // Download from GitHub
    const wdaVersion = await getLatestWDAVersionFromGitHub();
    const versionCacheDir = cachePath(`wda/${wdaVersion}`);
    const extractDir = path.join(versionCacheDir, 'extracted');
    const zipPath = path.join(
      versionCacheDir,
      `WebDriverAgentRunner-Build-Sim-${archStr}.zip`
    );
    wdaAppPath = path.join(extractDir, 'WebDriverAgentRunner-Runner.app');

    // Check if this specific version is already extracted (non-force case handled above, this covers edge cases)
    if (!forceRefreshWda && (await fileExists(wdaAppPath))) {
      result.wda_download = {
        status: 'skipped',
        detail: `WDA v${wdaVersion} already cached`,
      };
    } else {
      await mkdir(versionCacheDir, { recursive: true });
      await mkdir(extractDir, { recursive: true });

      const downloadUrl = `https://github.com/appium/WebDriverAgent/releases/download/v${wdaVersion}/WebDriverAgentRunner-Build-Sim-${archStr}.zip`;
      log.info(
        `Downloading prebuilt WDA v${wdaVersion} for ${platform} simulator...`
      );
      await downloadFile(downloadUrl, zipPath);

      log.info('Extracting WebDriverAgent...');
      await unzipFile(zipPath, extractDir);

      if (!(await fileExists(wdaAppPath))) {
        throw new Error(
          'WebDriverAgent extraction failed - app bundle not found'
        );
      }

      result.wda_download = {
        status: 'completed',
        detail: `WDA v${wdaVersion} downloaded and extracted to ${wdaAppPath}`,
      };
    }

    result.wdaAppPath = wdaAppPath;
  } catch (error: any) {
    result.wda_download = { status: 'failed', detail: error.message };
    result.wda_install = {
      status: 'skipped',
      detail: 'WDA download failed',
    };
    return result;
  }

  // ── Step 3: Install & launch WDA ──
  await installWdaStep(result, udid, wdaAppPath);
  return result;
}

async function installWdaStep(
  result: PrepareResult,
  udid: string,
  wdaAppPath: string
): Promise<void> {
  try {
    // Check if already running
    if (await isWDARunning(udid)) {
      result.wda_install = {
        status: 'skipped',
        detail: 'WDA is already running on the simulator',
      };
      result.ready = true;
      return;
    }

    // Install if not already installed
    const alreadyInstalled = await isWDAInstalled(udid);
    if (!alreadyInstalled) {
      log.info(`Installing WDA on simulator ${udid}...`);
      await installAppOnSimulator(wdaAppPath, udid);
    }

    // Launch
    const bundleId = await getAppBundleId(wdaAppPath);
    log.info(`Launching WDA with bundle ID: ${bundleId}`);
    await launchAppOnSimulator(bundleId, udid);

    result.wda_install = {
      status: 'completed',
      detail: alreadyInstalled
        ? `WDA already installed, launched (${bundleId})`
        : `WDA installed and launched (${bundleId})`,
    };
    result.ready = true;
  } catch (error: any) {
    result.wda_install = { status: 'failed', detail: error.message };
  }
}

// ── Tool registration ──

const prepareIosSimulatorSchema = z.object({
  udid: z
    .string()
    .describe(
      'The UDID of the iOS simulator to prepare. Use select_platform and select_device to get this.'
    ),
  platform: z
    .enum(['ios', 'tvos'])
    .optional()
    .describe('Simulator platform. Default: "ios". Use "tvos" for Apple TV.'),
  skipWda: z
    .boolean()
    .optional()
    .describe(
      'If true, only boot the simulator without downloading or installing WDA. Default: false.'
    ),
  forceRefreshWda: z
    .boolean()
    .optional()
    .describe(
      'If true, re-download WDA even if already cached. Default: false.'
    ),
});

export default function iosSimulatorSetup(server: any): void {
  server.addTool({
    name: 'prepare_ios_simulator',
    description:
      'Prepare an iOS simulator for Appium testing in a single call. Automatically boots the simulator, downloads prebuilt WDA (if not cached), and installs/launches WDA. Each step is skipped if already satisfied. Use skipWda=true to only boot without WDA.',
    parameters: prepareIosSimulatorSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof prepareIosSimulatorSchema>
    ): Promise<{ content: Array<{ type: string; text: string }> }> => {
      if (process.platform !== 'darwin') {
        throw new Error('iOS simulator preparation is only supported on macOS');
      }

      const {
        udid,
        platform = 'ios',
        skipWda = false,
        forceRefreshWda = false,
      } = args;

      log.info(
        `Preparing iOS simulator ${udid} (platform=${platform}, skipWda=${skipWda}, forceRefreshWda=${forceRefreshWda})`
      );

      const result = await prepareSimulator(
        udid,
        platform,
        skipWda,
        forceRefreshWda
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    },
  });
}
