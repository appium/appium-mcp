/**
 * Single-call tool to prepare an iOS real device for Appium testing.
 *
 * Two-mode flow:
 *  - Discovery (no provisioningProfileUuid given): returns the list of available
 *    .mobileprovision profiles so the LLM can ask the user which to use.
 *  - Build (provisioningProfileUuid given): chains download matching WDA release
 *    → package IPA → applesign. Download and unsigned IPA are cached per WDA
 *    version; the signed IPA is rebuilt every call so profile/cert changes never
 *    serve a stale signature.
 *
 * After a successful run, appium_session_management (action=create) calls
 * should pass the returned `capabilitiesHint` so Appium installs and launches
 * the signed prebuilt WDA bundle instead of rebuilding it.
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import { access, mkdir, readdir, readFile, rm, cp } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { net, plist, zip } from '@appium/support';
import { BOOTSTRAP_PATH } from 'appium-webdriveragent';
import Applesign from 'applesign';
import { provision } from 'ios-mobileprovision-finder';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';
import { textResult } from '../tool-response.js';
import { resolveAppiumMcpCachePath } from '../../utils/paths.js';

type StepStatus = 'completed' | 'skipped' | 'failed';

interface StepResult {
  status: StepStatus;
  detail: string;
}

interface PrepareRealDeviceResult {
  validate_device: StepResult;
  wda_download: StepResult;
  wda_package: StepResult;
  wda_sign: StepResult;
  ready: boolean;
  udid: string;
  signedIpaPath?: string;
  wdaBundleId?: string;
  capabilitiesHint?: Record<string, unknown>;
}

interface ProfileChoice {
  uuid: string;
  name: string;
  teamName: string;
  bundleId: string;
  filePath: string;
  expiresAt?: string;
  recommendedForWda: boolean;
  isWildcard: boolean;
}

// default signing bundle ID when the chosen provisioning profile is a wildcard ('*')
const WDA_RUNNER_BUNDLE_ID_FOR_XCTEST =
  'com.facebook.WebDriverAgentRunner.xctrunner';

// ── Filesystem helpers ──

interface PipelineInputs {
  udid: string;
  provisioningProfileUuid: string;
  forceRebuild: boolean;
}

// ── Provisioning profile discovery ──

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getProvisioningProfileDir(): string {
  return path.join(
    os.homedir(),
    'Library/Developer/Xcode/UserData/Provisioning Profiles'
  );
}

// ── WDA release resolution ──

async function listProvisioningProfiles(): Promise<ProfileChoice[]> {
  const dir = getProvisioningProfileDir();
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
    const isWildcard = bundleIdFromName === '*';
    return {
      uuid: mp.UUID,
      name: mp.Name,
      teamName: mp.TeamName,
      bundleId: bundleIdFromName,
      filePath: fullPath,
      expiresAt: mp.ExpirationDate
        ? new Date(mp.ExpirationDate).toISOString()
        : undefined,
      // Wildcards work too, we substitute a concrete .xctrunner bundle ID at sign time.
      // Specific profiles must already end in .xctrunner since the xcuitest driver re-appends
      // that suffix on launch (see appium-webdriveragent/lib/constants.ts DEFAULT_TEST_BUNDLE_SUFFIX).
      recommendedForWda: isWildcard || bundleIdFromName.endsWith('.xctrunner'),
      isWildcard,
    };
  });
}

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

async function downloadWdaApp(
  version: string,
  downloadDir: string
): Promise<string> {
  const url = `https://github.com/appium/WebDriverAgent/releases/download/v${version}/WebDriverAgentRunner-Runner.zip`;
  const zipPath = path.join(downloadDir, 'WebDriverAgentRunner-Runner.zip');

  await mkdir(downloadDir, { recursive: true });

  try {
    log.info(`Downloading WDA v${version} from ${url}...`);
    await net.downloadFile(url, zipPath, {
      headers: { 'User-Agent': 'appium-mcp' },
    });

    log.info('Extracting WDA zip...');
    await zip.extractAllTo(zipPath, downloadDir, { useSystemUnzip: true });
  } finally {
    await rm(zipPath, { force: true });
  }

  const appPath = path.join(downloadDir, 'WebDriverAgentRunner-Runner.app');
  if (!(await fileExists(appPath))) {
    throw new Error(
      `WebDriverAgentRunner-Runner.app not found after extracting ${url}. ` +
        `The release asset format may have changed.`
    );
  }
  return appPath;
}

// ── IPA packaging ──

async function stripFrameworks(appPath: string): Promise<void> {
  const frameworksDir = path.join(appPath, 'Frameworks');
  if (!(await fileExists(frameworksDir))) {
    return;
  }
  for (const f of await readdir(frameworksDir)) {
    await rm(path.join(frameworksDir, f), { recursive: true, force: true });
  }
}

// ── Signing ──

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

  await zip.toArchive(
    outIpaPath,
    { cwd: stagingDir, pattern: 'Payload/**' },
    { level: 9 }
  );

  await rm(stagingDir, { recursive: true, force: true });
}

// ── Bundle ID extraction (from the signed IPA) ──

async function signIpa(
  ipaPath: string,
  profile: ProfileChoice
): Promise<string> {
  // For wildcard profiles, applesign needs a concrete value, substitute the canonical WDA Runner bundle ID,
  // which the xcuitest driver expects to find at launch.
  const targetBundleId = profile.isWildcard
    ? WDA_RUNNER_BUNDLE_ID_FOR_XCTEST
    : profile.bundleId.trim();
  const opts: Record<string, unknown> = {
    file: ipaPath,
    mobileprovision: profile.filePath,
    bundleid: targetBundleId,
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

// ── Main pipeline ──

async function extractBundleIdFromIpa(ipaPath: string): Promise<string> {
  const tmpDir = path.join(path.dirname(ipaPath), `bundleid-${Date.now()}`);
  let bundleId: string | undefined;
  await mkdir(tmpDir, { recursive: true });
  try {
    await zip.readEntries(ipaPath, async ({ entry, extractEntryTo }) => {
      if (!/^Payload\/[^/]+\.app\/Info\.plist$/.test(entry.fileName)) {
        return true;
      }

      await extractEntryTo(tmpDir);
      const infoPlistPath = path.join(tmpDir, entry.fileName);
      const manifest = (await plist.parsePlistFile(infoPlistPath)) as {
        CFBundleIdentifier?: string;
      };
      bundleId = manifest.CFBundleIdentifier;
      return false;
    });

    if (!bundleId) {
      throw new Error(`No CFBundleIdentifier found in ${ipaPath}`);
    }
    return bundleId;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runPipeline(
  inputs: PipelineInputs
): Promise<PrepareRealDeviceResult> {
  const result: PrepareRealDeviceResult = {
    validate_device: { status: 'skipped', detail: '' },
    wda_download: { status: 'skipped', detail: '' },
    wda_package: { status: 'skipped', detail: '' },
    wda_sign: { status: 'skipped', detail: '' },
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
      result.wda_download = {
        status: 'failed',
        detail: `Provisioning profile UUID "${inputs.provisioningProfileUuid}" not found on this machine`,
      };
      return result;
    }
    profile = found;
  } catch (err) {
    result.wda_download = {
      status: 'failed',
      detail: (err as Error).message,
    };
    return result;
  }

  // ── Resolve cache paths ──
  const wdaVersion = await getWdaPackageVersion();
  const versionRoot = resolveAppiumMcpCachePath('wda-real', wdaVersion);
  const downloadDir = path.join(versionRoot, 'downloaded');
  const unsignedIpaPath = path.join(versionRoot, 'Payload.ipa');
  const signedDir = path.join(versionRoot, 'signed', profile.uuid);
  const stagedIpaPath = path.join(signedDir, 'Payload.ipa');
  const resignedIpaPath = path.join(signedDir, 'Payload-resigned.ipa');

  // ── Step 2: Download matching WDA release (cached) ──
  const downloadedAppPath = path.join(
    downloadDir,
    'WebDriverAgentRunner-Runner.app'
  );
  let appPath = downloadedAppPath;
  try {
    if (!inputs.forceRebuild && (await fileExists(downloadedAppPath))) {
      result.wda_download = {
        status: 'skipped',
        detail: `Reusing cached WDA release at ${downloadedAppPath}`,
      };
    } else {
      if (await fileExists(downloadDir)) {
        await rm(downloadDir, { recursive: true, force: true });
      }
      appPath = await downloadWdaApp(wdaVersion, downloadDir);
      await stripFrameworks(appPath);
      result.wda_download = {
        status: 'completed',
        detail: `Downloaded WDA v${wdaVersion} to ${appPath}`,
      };
    }
  } catch (err) {
    result.wda_download = {
      status: 'failed',
      detail: (err as Error).message,
    };
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
      await packageAppAsIpa(appPath, unsignedIpaPath);
      result.wda_package = {
        status: 'completed',
        detail: `Packaged unsigned IPA at ${unsignedIpaPath}`,
      };
    }
  } catch (err) {
    result.wda_package = { status: 'failed', detail: (err as Error).message };
    return result;
  }

  // ── Step 4: Resign (always re-sign; no cache) ──
  let bundleId: string;
  try {
    // Wipe any prior signed artifacts for this profile so applesign starts clean.
    await rm(signedDir, { recursive: true, force: true });
    await mkdir(signedDir, { recursive: true });
    // applesign mutates / writes alongside the input IPA; copy fresh into the per-profile dir first
    await cp(unsignedIpaPath, stagedIpaPath);
    log.info(
      `Signing IPA with profile ${profile.uuid} (wildcard=${profile.isWildcard})...`
    );
    const producedPath = await signIpa(stagedIpaPath, profile);
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
  } catch (err) {
    result.wda_sign = { status: 'failed', detail: (err as Error).message };
    return result;
  }

  result.signedIpaPath = resignedIpaPath;
  result.wdaBundleId = bundleId;

  result.ready = true;
  result.capabilitiesHint = {
    'appium:usePreinstalledWDA': true,
    'appium:prebuiltWDAPath': resignedIpaPath,
    'appium:wdaLaunchTimeout': 30000,
  };

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
  forceRebuild: z
    .boolean()
    .optional()
    .describe(
      'If true, ignore the cached WDA download and unsigned IPA and start clean. The signed IPA is always rebuilt regardless. Default: false.'
    ),
});

export default function prepareIosRealDevice(server: FastMCP): void {
  server.addTool({
    name: 'appium_prepare_ios_real_device',
    description:
      'Prepare an iOS real device for Appium testing in a single call. Two-mode flow: ' +
      '(1) Call without provisioningProfileUuid to receive the list of available .mobileprovision profiles — ' +
      'present them to the user (highlight any with recommendedForWda=true) and ask them to pick one. ' +
      '(2) Call again with the chosen UUID to download the matching WebDriverAgent release, package it as an IPA, ' +
      'and resign it with the chosen profile (wildcard "*" profiles are supported — a concrete WDA bundle ID is substituted at sign time). ' +
      'WDA download and unsigned IPA are cached per WDA version; the signed IPA is rebuilt every call. ' +
      'Pass the returned capabilitiesHint to appium_session_management (action=create) so Appium installs and launches the signed prebuilt WDA instead of rebuilding. ' +
      'Requires macOS, Xcode 16+, and a paired developer-mode device.',
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

      const { udid, provisioningProfileUuid, forceRebuild = false } = args;

      // Discovery mode: no profile chosen yet — return profile list for selection.
      if (!provisioningProfileUuid) {
        const profiles = await listProvisioningProfiles();
        const recommended = profiles.filter((p) => p.recommendedForWda);
        return textResult(
          JSON.stringify(
            {
              mode: 'discovery',
              udid,
              profiles,
              recommendedProfiles:
                recommended.length > 0 ? recommended : undefined,
              instructions:
                'Prefer profiles with recommendedForWda=true. These are profiles whose bundle ID either ends in .xctrunner ' +
                '(matches what the xcuitest driver re-appends at launch) or is a wildcard "*" (we substitute a concrete WDA bundle ID at sign time). ' +
                'Present the profiles to the user, highlight the recommended ones, and ask them to pick one by UUID. ' +
                'Then call this tool again with provisioningProfileUuid.',
            },
            null,
            2
          )
        );
      }

      log.info(
        `Preparing iOS real device ${udid} with profile ${provisioningProfileUuid} (forceRebuild=${forceRebuild})`
      );

      const result = await runPipeline({
        udid,
        provisioningProfileUuid,
        forceRebuild,
      });
      return textResult(JSON.stringify({ mode: 'build', ...result }, null, 2));
    },
  });
}
