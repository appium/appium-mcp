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
const profileUuid = '11111111-2222-3333-4444-555555555555';
const profileFile = path.join(profileDir, `${profileUuid}.mobileprovision`);
const versionRoot = resolveAppiumMcpCachePath('wda-real', '16.17.7');
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

async function runBuild(args: Record<string, unknown> = {}) {
  const response = await execute({
    udid: 'device-udid',
    provisioningProfileUuid: profileUuid,
    ...args,
  });
  return JSON.parse(response.content[0].text);
}

test('signs the staged IPA via applesign with the concrete profile bundle ID', async () => {
  const result = await runBuild();

  expect(result.ready).toBe(true);
  expect(result.wda_sign.status).toBe('completed');
  expect(result.signedIpaPath).toBe(resignedIpaPath);
  expect(result.wdaBundleId).toBe('com.example.WebDriverAgentRunner.xctrunner');
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
