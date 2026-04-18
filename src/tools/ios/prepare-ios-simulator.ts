/**
 * Single-call tool to prepare an iOS simulator for Appium testing.
 * Chains: boot simulator → download WDA → install & launch WDA.
 * Each step checks preconditions and skips if already satisfied.
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { access, mkdir, unlink, readdir, stat, rm } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import { zip } from '@appium/support';
import { Simctl } from 'node-simctl';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';
import { textResult } from '../tool-response.js';

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

// ── Filesystem helpers ──

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function cleanupFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
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
  await zip.extractAllTo(zipPath, destDir, { useSystemUnzip: true });
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

interface WDAState {
  installed: boolean;
  running: boolean;
}

async function getWDAState(simulatorUdid: string): Promise<WDAState> {
  let installed = false;

  // Check if installed via simctl listapps
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
        installed = true;
        break;
      }
    }
  } catch {
    return { installed: false, running: false };
  }

  if (!installed) {
    return { installed: false, running: false };
  }

  // Check if actually running via launchctl inside the simulator
  try {
    const { stdout } = await execAsync(
      `xcrun simctl spawn "${simulatorUdid}" launchctl list`
    );
    const running = stdout.includes('WebDriverAgentRunner');
    return { installed: true, running };
  } catch {
    return { installed: true, running: false };
  }
}

// ── Main pipeline ──

async function resolveWdaAppPath(
  forceRefreshWda: boolean,
  platform: 'ios' | 'tvos' = 'ios'
): Promise<{ wdaAppPath: string; version: string; downloaded: boolean }> {
  const arch = os.arch();
  const archStr = arch === 'arm64' ? 'arm64' : 'x86_64';
  const artifactPrefix =
    platform === 'tvos' ? 'WebDriverAgentRunner_tvOS' : 'WebDriverAgentRunner';

  // Check cache first (unless force refresh)
  if (!forceRefreshWda) {
    const cachedVersion = await getLatestWDAVersionFromCache();
    if (cachedVersion) {
      const cachedAppPath = path.join(
        cachePath(`wda/${cachedVersion}/extracted-${platform}`),
        `${artifactPrefix}-Runner.app`
      );
      if (await fileExists(cachedAppPath)) {
        return {
          wdaAppPath: cachedAppPath,
          version: cachedVersion,
          downloaded: false,
        };
      }
    }
  }

  // Download from GitHub
  const wdaVersion = await getLatestWDAVersionFromGitHub();
  const versionCacheDir = cachePath(`wda/${wdaVersion}`);
  const extractDir = path.join(versionCacheDir, `extracted-${platform}`);
  const zipPath = path.join(
    versionCacheDir,
    `${artifactPrefix}-Build-Sim-${archStr}.zip`
  );
  const wdaAppPath = path.join(extractDir, `${artifactPrefix}-Runner.app`);

  // Check if this specific version is already extracted
  if (!forceRefreshWda && (await fileExists(wdaAppPath))) {
    return { wdaAppPath, version: wdaVersion, downloaded: false };
  }

  // Clean any prior (possibly partial) extraction before downloading
  if (await fileExists(extractDir)) {
    await rm(extractDir, { recursive: true, force: true });
  }

  await mkdir(versionCacheDir, { recursive: true });
  await mkdir(extractDir, { recursive: true });

  const downloadUrl = `https://github.com/appium/WebDriverAgent/releases/download/v${wdaVersion}/${artifactPrefix}-Build-Sim-${archStr}.zip`;
  log.info(`Downloading prebuilt WDA v${wdaVersion}...`);
  await downloadFile(downloadUrl, zipPath);

  try {
    log.info('Extracting WebDriverAgent...');
    await unzipFile(zipPath, extractDir);
  } finally {
    // Clean up zip whether extraction succeeds or fails — the .app is what we cache
    await cleanupFile(zipPath);
  }

  if (!(await fileExists(wdaAppPath))) {
    throw new Error('WebDriverAgent extraction failed - app bundle not found');
  }

  return { wdaAppPath, version: wdaVersion, downloaded: true };
}

async function installWdaStep(
  result: PrepareResult,
  udid: string,
  wdaAppPath: string
): Promise<void> {
  try {
    const wdaState = await getWDAState(udid);

    // Check if already running
    if (wdaState.running) {
      result.wda_install = {
        status: 'skipped',
        detail: 'WDA is already running on the simulator',
      };
      result.ready = true;
      return;
    }

    // Install if not already installed
    if (!wdaState.installed) {
      log.info(`Installing WDA on simulator ${udid}...`);
      await installAppOnSimulator(wdaAppPath, udid);
    }

    // Launch
    const bundleId = await getAppBundleId(wdaAppPath);
    log.info(`Launching WDA with bundle ID: ${bundleId}`);
    await launchAppOnSimulator(bundleId, udid);

    result.wda_install = {
      status: 'completed',
      detail: wdaState.installed
        ? `WDA already installed, launched (${bundleId})`
        : `WDA installed and launched (${bundleId})`,
    };
    result.ready = true;
  } catch (error: any) {
    result.wda_install = { status: 'failed', detail: error.message };
  }
}

async function prepareSimulator(
  udid: string,
  skipWda: boolean,
  forceRefreshWda: boolean,
  platform: 'ios' | 'tvos' = 'ios'
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
        detail: `Simulator with UDID "${udid}" not found. Use select_device to get a valid UDID.`,
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
    const resolved = await resolveWdaAppPath(forceRefreshWda, platform);
    wdaAppPath = resolved.wdaAppPath;
    result.wdaAppPath = wdaAppPath;

    if (resolved.downloaded) {
      result.wda_download = {
        status: 'completed',
        detail: `WDA v${resolved.version} downloaded and extracted to ${wdaAppPath}`,
      };
    } else {
      result.wda_download = {
        status: 'skipped',
        detail: `WDA v${resolved.version} already cached at ${wdaAppPath}`,
      };
    }
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

// ── Tool registration ──

const prepareIosSimulatorSchema = z.object({
  udid: z
    .string()
    .describe(
      'The UDID of the iOS simulator to prepare. Use select_device to get this.'
    ),
  platform: z
    .enum(['ios', 'tvos'])
    .optional()
    .default('ios')
    .describe(
      'The simulator platform to download WDA for. Default is "ios". Use "tvos" for Apple TV simulators.'
    ),
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

export default function prepareIosSimulator(server: FastMCP): void {
  server.addTool({
    name: 'prepare_ios_simulator',
    description:
      'Prepare an iOS/tvOS simulator for Appium testing in a single call. Automatically boots the simulator, downloads prebuilt WDA (if not cached), and installs/launches WDA. Each step is skipped if already satisfied. Use skipWda=true to only boot without WDA.',
    parameters: prepareIosSimulatorSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof prepareIosSimulatorSchema>
    ): Promise<ContentResult> => {
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
        `Preparing ${platform} simulator ${udid} (skipWda=${skipWda}, forceRefreshWda=${forceRefreshWda})`
      );

      const result = await prepareSimulator(
        udid,
        skipWda,
        forceRefreshWda,
        platform
      );

      return textResult(JSON.stringify(result));
    },
  });
}
