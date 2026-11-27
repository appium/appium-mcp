import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, expect, jest, test} from '@jest/globals';

const applesignCtor = jest.fn<(opts: Record<string, unknown>) => void>();
const signIPA = jest.fn<(ipaPath: string) => Promise<void>>();

jest.unstable_mockModule('applesign', () => ({
  default: class MockApplesign {
    constructor(opts: Record<string, unknown>) {
      applesignCtor(opts);
    }

    signIPA = signIPA;
  },
}));

const listRealDevices = jest.fn<() => Promise<{udid: string}[]>>();
jest.unstable_mockModule('../../../devicemanager/ios-manager.js', () => ({
  IOSManager: {getInstance: () => ({listRealDevices})},
}));

jest.unstable_mockModule('../../../logger.js', () => ({
  default: {info: jest.fn(), warn: jest.fn(), error: jest.fn()},
}));

const downloadWda = jest.fn<(...args: unknown[]) => Promise<string>>();
jest.unstable_mockModule('../../../tools/ios/download-wda.js', () => ({
  downloadWda,
  wdaVersion: '16.17.7',
}));

const readFromFile =
  jest.fn<(filePath: string) => {UUID: string; Name: string; TeamName: string; ExpirationDate?: Date}>();
jest.unstable_mockModule('ios-mobileprovision-finder', () => ({
  provision: {readFromFile},
}));

const hasAccess = jest.fn<(filePath: string) => Promise<boolean>>();
const readdir = jest.fn<(dir: string) => Promise<string[]>>();
const rimraf = jest.fn<(target: string) => Promise<void>>();
const mkdirp = jest.fn<(dir: string) => Promise<void>>();
const copyFile = jest.fn<(src: string, dest: string) => Promise<void>>();
const readEntries =
  jest.fn<
    (
      zipPath: string,
      handler: (ctx: {entry: {fileName: string}; extractEntryTo: (dir: string) => Promise<void>}) => Promise<boolean>,
    ) => Promise<void>
  >();
const parsePlistFile = jest.fn<(plistPath: string) => Promise<{CFBundleIdentifier?: string}>>();

jest.unstable_mockModule('@appium/support', () => ({
  fs: {
    hasAccess,
    readdir,
    rimraf,
    mkdirp,
    copyFile,
  },
  zip: {
    toArchive: jest.fn(async () => {}),
    readEntries,
  },
  plist: {
    parsePlistFile,
  },
}));

const {resolveAppiumMcpCachePath} = await import('../../../utils/paths.js');
const {default: register} = await import('../../../tools/ios/prepare-ios-real-device.js');

let execute: (args: Record<string, unknown>) => Promise<{content: {text: string}[]}>;
register({
  addTool: (tool: {execute: typeof execute}) => {
    execute = tool.execute;
  },
} as never);

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
const profileDir = path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles');
const profileUuid = 'a1b2c3d4-2222-3333-4444-555555555555';
const profileFile = path.join(profileDir, `${profileUuid}.mobileprovision`);
const versionRoot = resolveAppiumMcpCachePath('wda-real', '16.17.7');
const downloadedAppPath = path.join(versionRoot, 'downloaded', 'WebDriverAgentRunner-Runner.app');
const unsignedIpaPath = path.join(versionRoot, 'Payload.ipa');
const signedDir = path.join(versionRoot, 'signed', profileUuid);
const stagedIpaPath = path.join(signedDir, 'Payload.ipa');
const resignedIpaPath = path.join(signedDir, 'Payload-resigned.ipa');

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(process, 'platform', {value: 'darwin'});
  listRealDevices.mockResolvedValue([{udid: 'device-udid'}]);
  readdir.mockResolvedValue([`${profileUuid}.mobileprovision`]);
  readFromFile.mockReturnValue({
    UUID: profileUuid,
    Name: 'iOS Team Provisioning Profile: com.example.WebDriverAgentRunner.xctrunner',
    TeamName: 'Example Team',
  });
  hasAccess.mockResolvedValue(true);
  rimraf.mockResolvedValue();
  mkdirp.mockResolvedValue();
  copyFile.mockResolvedValue();
  signIPA.mockResolvedValue();
  readEntries.mockImplementation(async (_zipPath, handler) => {
    await handler({
      entry: {fileName: 'Payload/WebDriverAgentRunner-Runner.app/Info.plist'},
      extractEntryTo: async () => {},
    });
  });
  parsePlistFile.mockResolvedValue({CFBundleIdentifier: 'com.example.WebDriverAgentRunner.xctrunner'});
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(process, 'platform', originalPlatform);
});

async function runTool(args: Record<string, unknown> = {}) {
  const response = await execute({
    udid: 'device-udid',
    ...args,
  });
  return JSON.parse(response.content[0].text);
}

async function runBuild(args: Record<string, unknown> = {}) {
  return await runTool({
    provisioningProfileUuid: profileUuid,
    ...args,
  });
}

test('rejects execution on non-macOS platforms', async () => {
  Object.defineProperty(process, 'platform', {value: 'linux'});

  await expect(runTool()).rejects.toThrow('iOS real-device preparation is only supported on macOS');
});

test('lists provisioning profiles and filters recommended WDA profiles in discovery mode', async () => {
  const expiration = new Date('2027-06-01T00:00:00.000Z');
  const wildcardUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const appUuid = '99999999-8888-7777-6666-555555555555';

  readdir.mockResolvedValue([
    `${profileUuid}.mobileprovision`,
    `${wildcardUuid}.mobileprovision`,
    `${appUuid}.mobileprovision`,
    '.DS_Store',
  ]);
  readFromFile.mockImplementation((filePath: string) => {
    if (filePath.includes(wildcardUuid)) {
      return {
        UUID: wildcardUuid,
        Name: 'iOS Team Provisioning Profile: *',
        TeamName: 'Example Team',
        ExpirationDate: expiration,
      };
    }
    if (filePath.includes(appUuid)) {
      return {
        UUID: appUuid,
        Name: 'iOS Team Provisioning Profile: com.example.app',
        TeamName: 'Example Team',
      };
    }
    return {
      UUID: profileUuid,
      Name: 'iOS Team Provisioning Profile: com.example.WebDriverAgentRunner.xctrunner',
      TeamName: 'Example Team',
    };
  });

  const result = await runTool();

  expect(result.mode).toBe('discovery');
  expect(result.udid).toBe('device-udid');
  expect(result.profiles).toHaveLength(3);
  expect(result.recommendedProfiles.map((p: {uuid: string}) => p.uuid)).toEqual([profileUuid, wildcardUuid]);
  expect(result.profiles[0]).toMatchObject({
    uuid: profileUuid,
    bundleId: 'com.example.WebDriverAgentRunner.xctrunner',
    isWildcard: false,
    recommendedForWda: true,
  });
  expect(result.profiles[1]).toMatchObject({
    uuid: wildcardUuid,
    bundleId: '*',
    isWildcard: true,
    recommendedForWda: true,
    expiresAt: expiration.toISOString(),
  });
  expect(result.profiles[2]).toMatchObject({
    uuid: appUuid,
    bundleId: 'com.example.app',
    isWildcard: false,
    recommendedForWda: false,
  });
  expect(applesignCtor).not.toHaveBeenCalled();
});

test('omits recommendedProfiles in discovery mode when no profile matches WDA requirements', async () => {
  readFromFile.mockReturnValue({
    UUID: profileUuid,
    Name: 'iOS Team Provisioning Profile: com.example.app',
    TeamName: 'Example Team',
  });

  const result = await runTool();

  expect(result.mode).toBe('discovery');
  expect(result.profiles).toHaveLength(1);
  expect(result.recommendedProfiles).toBeUndefined();
});

test('throws in discovery mode when the provisioning profiles directory is missing', async () => {
  hasAccess.mockImplementation(async (filePath: string) => filePath !== profileDir);

  await expect(runTool()).rejects.toThrow(`No provisioning profiles directory found at ${profileDir}`);
});

test('throws in discovery mode when no .mobileprovision files exist', async () => {
  readdir.mockResolvedValue(['.DS_Store', 'README.txt']);

  await expect(runTool()).rejects.toThrow(`No .mobileprovision files found in ${profileDir}`);
});

test('fails validate_device when the target UDID is not connected', async () => {
  listRealDevices.mockResolvedValue([{udid: 'other-device-udid'}]);

  const result = await runBuild();

  expect(result.mode).toBe('build');
  expect(result.ready).toBe(false);
  expect(result.validate_device).toEqual({
    status: 'failed',
    detail: 'No connected real iOS device with UDID "device-udid". Connect the device, trust the host, and try again.',
  });
  expect(result.wda_download.status).toBe('skipped');
  expect(applesignCtor).not.toHaveBeenCalled();
});

test('fails validate_device when listing real devices throws', async () => {
  listRealDevices.mockRejectedValue(new Error('usbmuxd unavailable'));

  const result = await runBuild();

  expect(result.ready).toBe(false);
  expect(result.validate_device).toEqual({
    status: 'failed',
    detail: 'usbmuxd unavailable',
  });
  expect(result.wda_sign.status).toBe('skipped');
});

test('fails wda_download when the requested provisioningProfileUuid is not found', async () => {
  const result = await runBuild({provisioningProfileUuid: '00000000-0000-0000-0000-000000000000'});

  expect(result.ready).toBe(false);
  expect(result.validate_device.status).toBe('completed');
  expect(result.wda_download).toEqual({
    status: 'failed',
    detail: 'Provisioning profile UUID "00000000-0000-0000-0000-000000000000" not found on this machine',
  });
  expect(result.wda_sign.status).toBe('skipped');
  expect(applesignCtor).not.toHaveBeenCalled();
});

test('fails wda_download when downloading an uncached WDA release fails', async () => {
  hasAccess.mockImplementation(async (filePath: string) => filePath !== downloadedAppPath);
  downloadWda.mockRejectedValue(new Error('GitHub API rate limit exceeded'));

  const result = await runBuild();

  expect(result.ready).toBe(false);
  expect(result.wda_download).toEqual({
    status: 'failed',
    detail: 'GitHub API rate limit exceeded',
  });
  expect(result.wda_package.status).toBe('skipped');
  expect(result.wda_sign.status).toBe('skipped');
  expect(applesignCtor).not.toHaveBeenCalled();
});

test('matches provisioningProfileUuid case-insensitively and signs the staged IPA with the concrete bundle ID', async () => {
  const result = await runBuild({provisioningProfileUuid: profileUuid.toUpperCase()});

  expect(result.mode).toBe('build');
  expect(result.ready).toBe(true);
  expect(result.wda_download.status).toBe('skipped');
  expect(result.wda_package.status).toBe('skipped');
  expect(result.wda_sign.status).toBe('completed');
  expect(result.signedIpaPath).toBe(resignedIpaPath);
  expect(result.wdaBundleId).toBe('com.example.WebDriverAgentRunner.xctrunner');
  expect(copyFile).toHaveBeenCalledWith(unsignedIpaPath, stagedIpaPath);
  expect(applesignCtor).toHaveBeenCalledWith({
    file: stagedIpaPath,
    mobileprovision: profileFile,
    bundleid: 'com.example.WebDriverAgentRunner.xctrunner',
    withGetTaskAllow: true,
    withoutPlugins: true,
  });
  expect(signIPA).toHaveBeenCalledWith(stagedIpaPath);
  expect(result.capabilitiesHint).toEqual({
    'appium:usePreinstalledWDA': true,
    'appium:prebuiltWDAPath': resignedIpaPath,
    'appium:wdaLaunchTimeout': 30000,
  });
});

test('substitutes the canonical WDA runner bundle ID when signing with a wildcard profile', async () => {
  readFromFile.mockReturnValue({
    UUID: profileUuid,
    Name: 'iOS Team Provisioning Profile: *',
    TeamName: 'Example Team',
  });
  parsePlistFile.mockResolvedValue({CFBundleIdentifier: 'com.facebook.WebDriverAgentRunner.xctrunner'});

  const result = await runBuild();

  expect(result.ready).toBe(true);
  expect(applesignCtor).toHaveBeenCalledWith(
    expect.objectContaining({
      bundleid: 'com.facebook.WebDriverAgentRunner.xctrunner',
      withGetTaskAllow: true,
      withoutPlugins: true,
    }),
  );
});

test('fails wda_sign when applesign does not produce the expected -resigned.ipa output', async () => {
  hasAccess.mockImplementation(async (filePath: string) => filePath !== resignedIpaPath);

  const result = await runBuild();

  expect(result.ready).toBe(false);
  expect(result.wda_sign).toEqual({
    status: 'failed',
    detail: `applesign did not produce ${resignedIpaPath}`,
  });
});

test('reports signing failures from applesign without throwing', async () => {
  signIPA.mockRejectedValue(new Error('codesign failed'));

  const result = await runBuild();

  expect(result.ready).toBe(false);
  expect(result.wda_sign).toEqual({
    status: 'failed',
    detail: 'codesign failed',
  });
});

test('fails wda_sign and cleans up temporary extraction dir when CFBundleIdentifier is missing', async () => {
  parsePlistFile.mockResolvedValue({});

  const result = await runBuild();

  expect(result.ready).toBe(false);
  expect(result.wda_sign).toEqual({
    status: 'failed',
    detail: `No CFBundleIdentifier found in ${resignedIpaPath}`,
  });
  expect(rimraf).toHaveBeenCalledWith(expect.stringContaining(path.join(signedDir, 'bundleid-')));
});
