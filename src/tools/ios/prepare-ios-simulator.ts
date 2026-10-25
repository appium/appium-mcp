import path from 'node:path';

import {NativeSimctl} from '@appium/coresim';
import {fs, net, plist, zip} from '@appium/support';
/**
 * Single-call tool to prepare an iOS simulator for Appium testing.
 * Chains: boot simulator → download WDA → install & launch WDA.
 * Each step checks preconditions and skips if already satisfied.
 */
import type {ContentResult, FastMCP} from 'fastmcp';
import {exec} from 'teen_process';
import {z} from 'zod';

import {IOSManager} from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';
import {resolveAppiumMcpCachePath} from '../../utils/paths.js';
import {findFreePort, releaseReservedPort} from '../../utils/ports.js';
import {textResult} from '../tool-response.js';

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
  wdaLocalPort?: number;
  webDriverAgentUrl?: string;
  capabilitiesHint?: Record<string, any>;
}

// ── Filesystem helpers ──

interface WDAState {
  installed: boolean;
  running: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
  return await fs.hasAccess(filePath);
}

// ── WDA download helpers ──

async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

// Resolves the latest WDA version via GitHub's release permalink instead of the REST API, avoiding the 60/hr
// unauthenticated API limit. Note: still subject to general GitHub rate limiting and redirect behavior.
async function getLatestWDAVersionFromGitHub(): Promise<string> {
  const permalink = 'https://github.com/appium/WebDriverAgent/releases/latest';
  const response = await fetch(permalink, {
    method: 'HEAD',
    redirect: 'manual',
    headers: {'User-Agent': 'mcp-appium'},
  });

  const location = response.headers.get('location');
  if (!location) {
    throw new Error(
      `Failed to resolve latest WDA version (${response.status} ${response.statusText}): no redirect from ${permalink}`,
    );
  }

  // Expected format: https://github.com/appium/WebDriverAgent/releases/tag/v<version>
  const match = location.match(/\/releases\/tag\/v?([^/]+)\/?$/);
  if (!match) {
    throw new Error(`Failed to parse WDA version from redirect location: ${location}`);
  }

  return match[1];
}

async function unzipFile(zipPath: string, destDir: string): Promise<void> {
  await zip.extractAllTo(zipPath, destDir, {useSystemUnzip: true});
}

// ── WDA install helpers ──

async function getLatestWDAVersionFromCache(): Promise<string | null> {
  const wdaCacheDir = resolveAppiumMcpCachePath('wda');

  if (!(await fileExists(wdaCacheDir))) {
    return null;
  }

  const entries = await fs.readdir(wdaCacheDir);
  const versions = await Promise.all(
    entries.map(async (dir) => {
      const dirPath = path.join(wdaCacheDir, dir);
      const stats = await fs.stat(dirPath);
      return stats.isDirectory() ? dir : null;
    }),
  );

  const filteredVersions = versions
    .filter((v): v is string => v !== null)
    .sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));

  return filteredVersions.length > 0 ? filteredVersions[0] : null;
}

async function getSimulatorArchitecture(simulatorUdid: string): Promise<string[]> {
  const value = await new NativeSimctl().getEnv(simulatorUdid, 'SIMULATOR_ARCHS');
  const archs = value.trim().split(/\s+/).filter(Boolean);
  if (archs.length === 0) {
    throw new Error(`No architectures reported for simulator ${simulatorUdid}`);
  }
  return archs;
}

async function installAppOnSimulator(appPath: string, simulatorUdid: string): Promise<void> {
  const simulator = new NativeSimctl();
  await simulator.installApp(simulatorUdid, appPath);
}

async function launchAppOnSimulator(bundleId: string, simulatorUdid: string, wdaPort: number): Promise<void> {
  const simulator = new NativeSimctl();
  await simulator.launchApp(simulatorUdid, bundleId, {environment: {USE_PORT: String(wdaPort)}});
}

async function terminateAppOnSimulator(bundleId: string, simulatorUdid: string): Promise<void> {
  try {
    const simulator = new NativeSimctl();
    await simulator.terminateApp(simulatorUdid, bundleId);
  } catch {
    // Nothing running to terminate — ignore.
  }
}

/** Loopback base URL a simulator's WDA is reachable at for a given local port. */
function wdaBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** Poll WDA's /status until it responds or the attempt budget is exhausted. */
async function waitForWdaReady(port: number): Promise<boolean> {
  const url = `${wdaBaseUrl(port)}/status`;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(2000)});
      if (res.ok) {
        return true;
      }
    } catch {
      // Not up yet — retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function getAppBundleId(appPath: string): Promise<string> {
  const manifest = (await plist.parsePlistFile(path.join(appPath, 'Info.plist'))) as {CFBundleIdentifier?: string};
  if (!manifest.CFBundleIdentifier) {
    throw new Error(`No CFBundleIdentifier found in ${appPath}`);
  }
  return manifest.CFBundleIdentifier;
}

async function getWDAState(simulatorUdid: string, bundleId: string): Promise<WDAState> {
  const simulator = new NativeSimctl();
  const installed = await simulator.isAppInstalled(simulatorUdid, bundleId);
  if (!installed) {
    return {installed: false, running: false};
  }

  try {
    const processes = await simulator.listProcesses(simulatorUdid);
    return {installed: true, running: processes.some(({name}) => name === bundleId)};
  } catch {
    return {installed: true, running: false};
  }
}

// ── Main pipeline ──

async function resolveWdaAppPath(
  simulatorUdid: string,
  forceRefreshWda: boolean,
  platform: 'ios' | 'tvos' = 'ios',
): Promise<{
  wdaAppPath: string;
  version: string;
  source: 'env' | 'cache' | 'download';
}> {
  // Provide a way to override the WDA app path via an env variable (useful in environments where external downloads are blocked)
  const envAppPath = process.env.APPIUM_MCP_WDA_APP_PATH;
  if (envAppPath) {
    if (!envAppPath.endsWith('.app')) {
      throw new Error(`APPIUM_MCP_WDA_APP_PATH must point to a .app bundle, got: ${envAppPath}`);
    }
    if (!(await fileExists(envAppPath))) {
      throw new Error(`APPIUM_MCP_WDA_APP_PATH points to a non-existent path: ${envAppPath}`);
    }
    if (forceRefreshWda) {
      log.warn('forceRefreshWda=true is ignored because APPIUM_MCP_WDA_APP_PATH is set');
    }
    return {
      wdaAppPath: envAppPath,
      version: 'user-provided',
      source: 'env',
    };
  }

  const archs = await getSimulatorArchitecture(simulatorUdid);
  const archStr = archs.includes('arm64') ? 'arm64' : archs[0];
  const isRosetta = await exec('sysctl', ['-in', 'sysctl.proc_translated']).then(({stdout}) => stdout.trim() === '1');
  if (isRosetta) {
    log.info(`Running under Rosetta. Simulator architecture: ${archs.join(', ')}. Using ${archStr} WDA build.`);
  }
  const artifactPrefix = platform === 'tvos' ? 'WebDriverAgentRunner_tvOS' : 'WebDriverAgentRunner';

  // Check cache first (unless force refresh)
  if (!forceRefreshWda) {
    const cachedVersion = await getLatestWDAVersionFromCache();
    if (cachedVersion) {
      const cachedAppPath = path.join(
        resolveAppiumMcpCachePath('wda', cachedVersion, `extracted-${platform}`),
        `${artifactPrefix}-Runner.app`,
      );
      if (await fileExists(cachedAppPath)) {
        return {
          wdaAppPath: cachedAppPath,
          version: cachedVersion,
          source: 'cache',
        };
      }
    }
  }

  // Download from GitHub
  const wdaVersion = await getLatestWDAVersionFromGitHub();
  const versionCacheDir = resolveAppiumMcpCachePath('wda', wdaVersion);
  const extractDir = path.join(versionCacheDir, `extracted-${platform}`);
  const zipPath = path.join(versionCacheDir, `${artifactPrefix}-Build-Sim-${archStr}.zip`);
  const wdaAppPath = path.join(extractDir, `${artifactPrefix}-Runner.app`);

  // Check if this specific version is already extracted
  if (!forceRefreshWda && (await fileExists(wdaAppPath))) {
    return {wdaAppPath, version: wdaVersion, source: 'cache'};
  }

  // Clean any prior (possibly partial) extraction before downloading
  if (await fileExists(extractDir)) {
    await fs.rimraf(extractDir);
  }

  await fs.mkdirp(versionCacheDir);
  await fs.mkdirp(extractDir);

  const downloadUrl = `https://github.com/appium/WebDriverAgent/releases/download/v${wdaVersion}/${artifactPrefix}-Build-Sim-${archStr}.zip`;
  log.info(`Downloading prebuilt WDA v${wdaVersion}...`);
  await net.downloadFile(downloadUrl, zipPath, {
    headers: {'User-Agent': 'appium-mcp'},
  });

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

  return {wdaAppPath, version: wdaVersion, source: 'download'};
}

async function installWdaStep(result: PrepareResult, udid: string, wdaAppPath: string): Promise<void> {
  try {
    const bundleId = await getAppBundleId(wdaAppPath);
    const wdaState = await getWDAState(udid, bundleId);

    // Install if not already installed.
    if (!wdaState.installed) {
      log.info(`Installing WDA on simulator ${udid}...`);
      await installAppOnSimulator(wdaAppPath, udid);
    }

    // XCUITest won't reuse a WDA it didn't start (its connection factory needs
    // wdaLocalPort free), so the session connects to this instance via the
    // returned webDriverAgentUrl instead. Launch on a freshly allocated port so
    // each simulator gets its own — terminate any prior instance first so the
    // port we report is the one actually serving.
    if (wdaState.running) {
      log.info(`Terminating existing WDA (${bundleId}) before relaunch...`);
      await terminateAppOnSimulator(bundleId, udid);
    }

    const wdaPort = await findFreePort();
    let ready = false;
    try {
      log.info(`Launching WDA (${bundleId}) on port ${wdaPort}...`);
      await launchAppOnSimulator(bundleId, udid, wdaPort);
      ready = await waitForWdaReady(wdaPort);
    } finally {
      // Once WDA has bound the port the OS guards it; on failure it's free again.
      // Either way the reservation has served its purpose — release it.
      releaseReservedPort(wdaPort);
    }

    if (!ready) {
      result.wda_install = {
        status: 'failed',
        detail: `WDA launched on port ${wdaPort} but did not become ready`,
      };
      return;
    }

    const webDriverAgentUrl = wdaBaseUrl(wdaPort);
    result.wdaLocalPort = wdaPort;
    result.webDriverAgentUrl = webDriverAgentUrl;
    result.capabilitiesHint = {'appium:webDriverAgentUrl': webDriverAgentUrl};
    result.wda_install = {
      status: 'completed',
      detail: `WDA ${wdaState.installed ? 'already installed, ' : ''}launched and ready on ${webDriverAgentUrl}`,
    };
    result.ready = true;
  } catch (error: any) {
    result.wda_install = {status: 'failed', detail: error.message};
  }
}

async function prepareSimulator(
  udid: string,
  skipWda: boolean,
  forceRefreshWda: boolean,
  platform: 'ios' | 'tvos' = 'ios',
): Promise<PrepareResult> {
  const result: PrepareResult = {
    boot: {status: 'skipped', detail: ''},
    wda_download: {status: 'skipped', detail: ''},
    wda_install: {status: 'skipped', detail: ''},
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
      const device = new NativeSimctl();
      await device.bootDevice(udid);
      await device.waitForBoot(udid, {timeoutMs: 120000});
      result.boot = {
        status: 'completed',
        detail: `${simulator.name} booted successfully`,
      };
    }
  } catch (error: any) {
    result.boot = {status: 'failed', detail: error.message};
    return result;
  }

  if (skipWda) {
    result.wda_download = {status: 'skipped', detail: 'skipWda=true'};
    result.wda_install = {status: 'skipped', detail: 'skipWda=true'};
    result.ready = true;
    return result;
  }

  // ── Step 2: Download WDA ──
  let wdaAppPath: string;
  try {
    const resolved = await resolveWdaAppPath(udid, forceRefreshWda, platform);
    wdaAppPath = resolved.wdaAppPath;
    result.wdaAppPath = wdaAppPath;

    if (resolved.source === 'download') {
      result.wda_download = {
        status: 'completed',
        detail: `WDA v${resolved.version} downloaded and extracted to ${wdaAppPath}`,
      };
    } else if (resolved.source === 'cache') {
      result.wda_download = {
        status: 'skipped',
        detail: `WDA v${resolved.version} already cached at ${wdaAppPath}`,
      };
    } else {
      result.wda_download = {
        status: 'skipped',
        detail: `Using WDA from APPIUM_MCP_WDA_APP_PATH: ${wdaAppPath}`,
      };
    }
  } catch (error: any) {
    result.wda_download = {status: 'failed', detail: error.message};
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
  udid: z.string().describe('The UDID of the iOS simulator to prepare. Use select_device to get this.'),
  platform: z
    .enum(['ios', 'tvos'])
    .optional()
    .default('ios')
    .describe('The simulator platform to download WDA for. Default is "ios". Use "tvos" for Apple TV simulators.'),
  skipWda: z
    .boolean()
    .optional()
    .describe('If true, only boot the simulator without downloading or installing WDA. Default: false.'),
  forceRefreshWda: z.boolean().optional().describe('If true, re-download WDA even if already cached. Default: false.'),
});

export default function prepareIosSimulator(server: FastMCP): void {
  server.addTool({
    name: 'prepare_ios_simulator',
    description:
      'Boot an iOS/tvOS simulator, download/cache WDA, and launch it on a free per-simulator port. ' +
      'Pass capabilitiesHint (appium:webDriverAgentUrl) to appium_session_management action=create to reuse WDA. ' +
      'skipWda=true only boots. APPIUM_MCP_WDA_APP_PATH can point to an extracted WebDriverAgentRunner-Runner.app (absolute path) to skip download.',
    parameters: prepareIosSimulatorSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof prepareIosSimulatorSchema>): Promise<ContentResult> => {
      if (process.platform !== 'darwin') {
        throw new Error('iOS simulator preparation is only supported on macOS');
      }

      const {udid, platform = 'ios', skipWda = false, forceRefreshWda = false} = args;

      log.info(`Preparing ${platform} simulator ${udid} (skipWda=${skipWda}, forceRefreshWda=${forceRefreshWda})`);

      const result = await prepareSimulator(udid, skipWda, forceRefreshWda, platform);

      return textResult(JSON.stringify(result));
    },
  });
}
