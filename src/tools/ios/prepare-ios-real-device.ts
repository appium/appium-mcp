/**
 * Single-call tool to prepare an iOS real device for Appium testing.
 *
 * Two-mode flow:
 *  - Discovery (no provisioningProfileUuid given): returns the list of available
 *    .mobileprovision profiles so the LLM can ask the user which to use plus
 *    whether the underlying account is free or enterprise.
 *  - Build (provisioningProfileUuid + isFreeAccount given): chains
 *    xcodebuild → package IPA → applesign → install on device. Each step is
 *    cached so re-runs are fast.
 *
 * After a successful run the WDA app is installed on the device. Subsequent
 * create_session calls should pass `appium:usePreinstalledWDA: true` together
 * with the returned `wdaBundleId` (as `appium:updatedWDABundleId`) so Appium
 * skips its own rebuild.
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { access, mkdir, readdir, readFile, rm, cp } from 'node:fs/promises';
import { constants, createWriteStream, existsSync } from 'node:fs';
import { BOOTSTRAP_PATH } from 'appium-webdriveragent';
import Applesign from 'applesign';
import { provision } from 'ios-mobileprovision-finder';
import archiver from 'archiver';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';
import { textResult } from '../tool-response.js';

const execAsync = promisify(exec);

type StepStatus = 'completed' | 'skipped' | 'failed';

interface StepResult {
  status: StepStatus;
  detail: string;
}

interface PrepareRealDeviceResult {
  validate_device: StepResult;
  wda_build: StepResult;
  wda_package: StepResult;
  wda_sign: StepResult;
  wda_install: StepResult;
  ready: boolean;
  udid: string;
  signedIpaPath?: string;
  wdaBundleId?: string;
  capabilitiesHint?: Record<string, unknown>;
  requiresUserTrust?: boolean;
  userAction?: string;
}

interface ProfileChoice {
  uuid: string;
  name: string;
  teamName: string;
  bundleId: string;
  filePath: string;
  expiresAt?: string;
}

// ── Filesystem helpers ──

function cachePath(folder: string): string {
  return path.join(os.homedir(), '.cache', 'appium-mcp', folder);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ── Provisioning profile discovery ──

async function getXcodeMajorVersion(): Promise<number> {
  const { stdout } = await execAsync('xcodebuild -version');
  const match = stdout.match(/Xcode (\d+)\./);
  if (!match) {
    throw new Error('Unable to determine Xcode version');
  }
  return parseInt(match[1], 10);
}

async function getProvisioningProfileDir(): Promise<string> {
  const xcodeVersion = await getXcodeMajorVersion();
  // Xcode 16+ moved the profiles directory under Xcode/UserData
  if (xcodeVersion <= 15) {
    return path.join(
      os.homedir(),
      'Library/MobileDevice/Provisioning Profiles'
    );
  }
  return path.join(
    os.homedir(),
    'Library/Developer/Xcode/UserData/Provisioning Profiles'
  );
}

async function listProvisioningProfiles(): Promise<ProfileChoice[]> {
  const dir = await getProvisioningProfileDir();
  if (!existsSync(dir)) {
    throw new Error(
      `No provisioning profiles directory found at ${dir}.\n` +
        `To create profiles: open Xcode → Settings → Accounts → add your Apple ID, ` +
        `then open any iOS project and let Xcode auto-generate signing profiles, ` +
        `or create a new iOS project and run it on your device once.`
    );
  }

  const files = (await readdir(dir)).filter((f) =>
    f.endsWith('.mobileprovision')
  );
  if (files.length === 0) {
    throw new Error(
      `No .mobileprovision files found in ${dir}.\n` +
        `To create profiles: open Xcode → Settings → Accounts → add your Apple ID, ` +
        `then open any iOS project and let Xcode auto-generate signing profiles, ` +
        `or create a new iOS project and run it on your device once.`
    );
  }

  return files.map((file) => {
    const fullPath = path.join(dir, file);
    const mp = provision.readFromFile(fullPath);
    // The provision Name typically formats as "iOS Team Provisioning Profile: <bundleId>"
    const bundleIdFromName = mp.Name.split(':')[1]?.trim() ?? '';
    return {
      uuid: mp.UUID,
      name: mp.Name,
      teamName: mp.TeamName,
      bundleId: bundleIdFromName,
      filePath: fullPath,
      expiresAt: mp.ExpirationDate
        ? new Date(mp.ExpirationDate).toISOString()
        : undefined,
    };
  });
}

// ── WDA project resolution ──

async function getWdaPackageVersion(): Promise<string> {
  try {
    const pkgPath = path.join(BOOTSTRAP_PATH, 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── xcodebuild ──

async function buildWdaUnsigned(
  projectDir: string,
  derivedDataPath: string
): Promise<string> {
  const cmd = [
    'xcodebuild',
    'clean',
    'build-for-testing',
    '-project',
    'WebDriverAgent.xcodeproj',
    '-derivedDataPath',
    `"${derivedDataPath}"`,
    '-scheme',
    'WebDriverAgentRunner',
    '-destination',
    'generic/platform=iOS',
    'CODE_SIGNING_ALLOWED=NO',
  ].join(' ');
  await execAsync(cmd, { cwd: projectDir, maxBuffer: 1024 * 1024 * 64 });
  const builtAppPath = path.join(
    derivedDataPath,
    'Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app'
  );
  if (!(await fileExists(builtAppPath))) {
    throw new Error(
      `xcodebuild succeeded but ${builtAppPath} was not produced`
    );
  }
  return builtAppPath;
}

async function stripFrameworks(appPath: string): Promise<void> {
  const frameworksDir = path.join(appPath, 'Frameworks');
  if (!(await fileExists(frameworksDir))) {
    return;
  }
  for (const f of await readdir(frameworksDir)) {
    await rm(path.join(frameworksDir, f), { recursive: true, force: true });
  }
}

// ── IPA packaging ──

async function packageAppAsIpa(
  appPath: string,
  outIpaPath: string
): Promise<void> {
  // The IPA spec wants the .app bundle nested inside a top-level "Payload" dir.
  const stagingDir = path.join(
    path.dirname(outIpaPath),
    `staging-${path.basename(outIpaPath, '.ipa')}`
  );
  const payloadDir = path.join(stagingDir, 'Payload');
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(payloadDir, { recursive: true });
  await cp(appPath, path.join(payloadDir, path.basename(appPath)), {
    recursive: true,
  });

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outIpaPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err: Error) => reject(err));
    archive.pipe(output);
    archive.directory(payloadDir, 'Payload');
    archive.finalize();
  });

  await rm(stagingDir, { recursive: true, force: true });
}

// ── Signing ──

async function signIpa(
  ipaPath: string,
  profile: ProfileChoice,
  isFreeAccount: boolean
): Promise<string> {
  const opts: Record<string, unknown> = {
    file: ipaPath,
    mobileprovision: profile.filePath,
    // Free accounts must override the bundle id to match the personal team prefix
    bundleid: isFreeAccount ? profile.bundleId.trim() : '',
    withGetTaskAllow: true,
    withoutPlugins: true,
  };
  const as = new Applesign(opts);
  await as.signIPA(ipaPath);

  const resignedPath = path.join(
    path.dirname(ipaPath),
    `${path.basename(ipaPath, '.ipa')}-resigned.ipa`
  );
  if (!(await fileExists(resignedPath))) {
    throw new Error(`applesign did not produce ${resignedPath}`);
  }
  return resignedPath;
}

// ── Bundle ID extraction (from the signed IPA) ──

async function extractBundleIdFromIpa(ipaPath: string): Promise<string> {
  // Unzip just enough to read Info.plist. Use system unzip to avoid pulling
  // another archiver dep purely for reads.
  const tmpDir = path.join(path.dirname(ipaPath), `bundleid-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    await execAsync(
      `unzip -oqq "${ipaPath}" "Payload/*.app/Info.plist" -d "${tmpDir}"`
    );
    const payloadDir = path.join(tmpDir, 'Payload');
    const apps = (await readdir(payloadDir)).filter((d) => d.endsWith('.app'));
    if (apps.length === 0) {
      throw new Error('No .app bundle in resigned IPA');
    }
    const plistPath = path.join(payloadDir, apps[0], 'Info.plist');
    const { stdout } = await execAsync(
      `/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "${plistPath}"`
    );
    return stdout.trim();
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// ── Device install ──

async function installIpaOnDevice(
  ipaPath: string,
  udid: string
): Promise<void> {
  // xcrun devicectl is the modern install path (Xcode 15+, iOS 17+).
  // It accepts both .ipa and .app payloads and handles upgrades transparently.
  const cmd = `xcrun devicectl device install app --device "${udid}" "${ipaPath}"`;
  await execAsync(cmd, { maxBuffer: 1024 * 1024 * 16 });
}

// ── Main pipeline ──

interface PipelineInputs {
  udid: string;
  provisioningProfileUuid: string;
  isFreeAccount: boolean;
  forceRebuild: boolean;
  skipInstall: boolean;
}

async function runPipeline(
  inputs: PipelineInputs
): Promise<PrepareRealDeviceResult> {
  const result: PrepareRealDeviceResult = {
    validate_device: { status: 'skipped', detail: '' },
    wda_build: { status: 'skipped', detail: '' },
    wda_package: { status: 'skipped', detail: '' },
    wda_sign: { status: 'skipped', detail: '' },
    wda_install: { status: 'skipped', detail: '' },
    ready: false,
    udid: inputs.udid,
  };

  // ── Step 1: Validate device ──
  try {
    const realDevices = await IOSManager.getInstance().listRealDevices();
    const match = realDevices.find((d) => d.udid === inputs.udid);
    if (!match) {
      result.validate_device = {
        status: 'failed',
        detail:
          `No connected real iOS device with UDID "${inputs.udid}". ` +
          `Connect the device, trust the host, and try again.`,
      };
      return result;
    }
    result.validate_device = {
      status: 'completed',
      detail: `Real device ${inputs.udid} is connected`,
    };
  } catch (err) {
    result.validate_device = {
      status: 'failed',
      detail: (err as Error).message,
    };
    return result;
  }

  // ── Resolve profile ──
  let profile: ProfileChoice;
  try {
    const profiles = await listProvisioningProfiles();
    const found = profiles.find(
      (p) =>
        p.uuid.toLowerCase() === inputs.provisioningProfileUuid.toLowerCase()
    );
    if (!found) {
      result.wda_build = {
        status: 'failed',
        detail: `Provisioning profile UUID "${inputs.provisioningProfileUuid}" not found on this machine`,
      };
      return result;
    }
    profile = found;
  } catch (err) {
    result.wda_build = {
      status: 'failed',
      detail: (err as Error).message,
    };
    return result;
  }

  // ── Resolve cache paths ──
  const wdaVersion = await getWdaPackageVersion();
  const versionRoot = cachePath(`wda-real/${wdaVersion}`);
  const derivedDataPath = path.join(versionRoot, 'derived');
  const unsignedIpaPath = path.join(versionRoot, 'Payload.ipa');
  const flag = inputs.isFreeAccount ? 'free' : 'ent';
  const signedDir = path.join(versionRoot, 'signed', `${profile.uuid}-${flag}`);
  const stagedIpaPath = path.join(signedDir, 'Payload.ipa');
  const resignedIpaPath = path.join(signedDir, 'Payload-resigned.ipa');

  // ── Step 2: Build (cached) ──
  const builtAppPath = path.join(
    derivedDataPath,
    'Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app'
  );
  try {
    if (!inputs.forceRebuild && (await fileExists(builtAppPath))) {
      result.wda_build = {
        status: 'skipped',
        detail: `Reusing cached WDA build at ${builtAppPath}`,
      };
    } else {
      if (await fileExists(derivedDataPath)) {
        await rm(derivedDataPath, { recursive: true, force: true });
      }
      await mkdir(derivedDataPath, { recursive: true });
      log.info(`Building WDA v${wdaVersion} unsigned...`);
      await buildWdaUnsigned(BOOTSTRAP_PATH, derivedDataPath);
      await stripFrameworks(builtAppPath);
      result.wda_build = {
        status: 'completed',
        detail: `Built WDA v${wdaVersion} into ${builtAppPath}`,
      };
    }
  } catch (err) {
    result.wda_build = { status: 'failed', detail: (err as Error).message };
    return result;
  }

  // ── Step 3: Package as IPA (cached) ──
  try {
    if (!inputs.forceRebuild && (await fileExists(unsignedIpaPath))) {
      result.wda_package = {
        status: 'skipped',
        detail: `Reusing cached unsigned IPA at ${unsignedIpaPath}`,
      };
    } else {
      log.info('Packaging WDA as unsigned IPA...');
      await packageAppAsIpa(builtAppPath, unsignedIpaPath);
      result.wda_package = {
        status: 'completed',
        detail: `Packaged unsigned IPA at ${unsignedIpaPath}`,
      };
    }
  } catch (err) {
    result.wda_package = { status: 'failed', detail: (err as Error).message };
    return result;
  }

  // ── Step 4: Resign (cached per profile) ──
  let bundleId: string;
  try {
    if (!inputs.forceRebuild && (await fileExists(resignedIpaPath))) {
      bundleId = await extractBundleIdFromIpa(resignedIpaPath);
      result.wda_sign = {
        status: 'skipped',
        detail: `Reusing cached signed IPA at ${resignedIpaPath} (bundleId=${bundleId})`,
      };
    } else {
      await mkdir(signedDir, { recursive: true });
      // applesign mutates / writes alongside the input IPA; copy fresh into the per-profile dir first
      await cp(unsignedIpaPath, stagedIpaPath);
      log.info(
        `Signing IPA with profile ${profile.uuid} (free=${inputs.isFreeAccount})...`
      );
      const producedPath = await signIpa(
        stagedIpaPath,
        profile,
        inputs.isFreeAccount
      );
      // signIpa returns "<basename>-resigned.ipa" alongside the staged copy — that
      // already matches resignedIpaPath, but assert to be defensive.
      if (path.resolve(producedPath) !== path.resolve(resignedIpaPath)) {
        await cp(producedPath, resignedIpaPath);
      }
      bundleId = await extractBundleIdFromIpa(resignedIpaPath);
      result.wda_sign = {
        status: 'completed',
        detail: `Signed IPA at ${resignedIpaPath} (bundleId=${bundleId})`,
      };
    }
  } catch (err) {
    result.wda_sign = { status: 'failed', detail: (err as Error).message };
    return result;
  }

  result.signedIpaPath = resignedIpaPath;
  result.wdaBundleId = bundleId;

  // ── Step 5: Install on device ──
  if (inputs.skipInstall) {
    result.wda_install = {
      status: 'skipped',
      detail: 'skipInstall=true — IPA was not pushed to the device',
    };
  } else {
    try {
      log.info(`Installing WDA on device ${inputs.udid}...`);
      await installIpaOnDevice(resignedIpaPath, inputs.udid);
      result.wda_install = {
        status: 'completed',
        detail: `Installed ${bundleId} on ${inputs.udid} via xcrun devicectl`,
      };
    } catch (err) {
      result.wda_install = {
        status: 'failed',
        detail:
          `xcrun devicectl install failed: ${(err as Error).message}. ` +
          `Verify Xcode 15+ is installed, the device is paired, and developer mode is enabled. ` +
          `Signed IPA is still available at ${resignedIpaPath}.`,
      };
      return result;
    }
  }

  result.ready = true;
  result.capabilitiesHint = {
    'appium:usePreinstalledWDA': true,
    'appium:updatedWDABundleId': bundleId.replace(/\.xctrunner$/, ''),
    'appium:wdaLaunchTimeout': 30000,
  };

  // Enterprise profiles (ProvisionsAllDevices) skip the trust step; all others require it.
  // We can't detect enterprise here, so prompt whenever a fresh install occurred.
  if (result.wda_install.status === 'completed') {
    result.requiresUserTrust = true;
    result.userAction =
      'On the iPhone, go to Settings → General → VPN & Device Management, ' +
      'tap the developer certificate under "Developer App", then tap Trust. ' +
      'Confirm with the user that this is done before starting the Appium session.';
  }

  return result;
}

// ── Tool registration ──

const prepareRealDeviceSchema = z.object({
  udid: z
    .string()
    .describe(
      'UDID of the connected iOS real device. Use select_device to discover it.'
    ),
  provisioningProfileUuid: z
    .string()
    .optional()
    .describe(
      'UUID of the .mobileprovision profile to sign WDA with. If omitted, the tool returns the list of available profiles so you can ask the user to pick one.'
    ),
  isFreeAccount: z
    .boolean()
    .optional()
    .describe(
      'Required when provisioningProfileUuid is given. true if the profile belongs to a free Apple ID (7-day expiry, no team prefix), false for a paid/enterprise team. Ask the user — do not infer from the UUID.'
    ),
  forceRebuild: z
    .boolean()
    .optional()
    .describe(
      'If true, ignore cached xcodebuild output and signed IPA and start clean. Default: false.'
    ),
  skipInstall: z
    .boolean()
    .optional()
    .describe(
      'If true, build and sign WDA but do not push it to the device. Default: false.'
    ),
});

export default function prepareIosRealDevice(server: FastMCP): void {
  server.addTool({
    name: 'appium_prepare_ios_real_device',
    description:
      'Prepare an iOS real device for Appium testing in a single call. Two-mode flow: ' +
      '(1) Call without provisioningProfileUuid to receive the list of available .mobileprovision profiles — ' +
      'present them to the user and confirm whether the chosen profile belongs to a free Apple ID or a paid/enterprise team. ' +
      '(2) Call again with the chosen UUID and isFreeAccount to build WebDriverAgent (unsigned), package it as an IPA, ' +
      'resign it with the chosen profile, and install it on the device. ' +
      'Each step is cached so repeat runs are fast. ' +
      'IMPORTANT: If the result contains requiresUserTrust=true, present the userAction message to the user and wait for ' +
      'them to confirm they have trusted the certificate on the device BEFORE calling create_session. ' +
      'Skipping this step will cause the session to hang or fail. ' +
      'After the user confirms, pass the returned capabilitiesHint to create_session ' +
      'so Appium reuses the preinstalled WDA instead of rebuilding. Requires macOS, Xcode 15+, and a paired developer-mode device.',
    parameters: prepareRealDeviceSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof prepareRealDeviceSchema>
    ): Promise<ContentResult> => {
      if (process.platform !== 'darwin') {
        throw new Error(
          'iOS real-device preparation is only supported on macOS'
        );
      }

      const {
        udid,
        provisioningProfileUuid,
        isFreeAccount,
        forceRebuild = false,
        skipInstall = false,
      } = args;

      // Discovery mode: no profile chosen yet — return profile list for selection.
      if (!provisioningProfileUuid) {
        const profiles = await listProvisioningProfiles();
        return textResult(
          JSON.stringify(
            {
              mode: 'discovery',
              udid,
              profiles,
              instructions:
                "Present the profiles to the user and ask them to (a) pick one by UUID and (b) confirm whether the profile's Apple ID is free (7-day expiry) or paid/enterprise. Then call this tool again with provisioningProfileUuid and isFreeAccount.",
            },
            null,
            2
          )
        );
      }

      if (isFreeAccount === undefined) {
        throw new Error(
          'isFreeAccount is required when provisioningProfileUuid is provided. Ask the user whether the chosen profile belongs to a free Apple ID or a paid/enterprise team.'
        );
      }

      log.info(
        `Preparing iOS real device ${udid} with profile ${provisioningProfileUuid} (free=${isFreeAccount}, forceRebuild=${forceRebuild}, skipInstall=${skipInstall})`
      );

      const result = await runPipeline({
        udid,
        provisioningProfileUuid,
        isFreeAccount,
        forceRebuild,
        skipInstall,
      });
      return textResult(JSON.stringify({ mode: 'build', ...result }, null, 2));
    },
  });
}
