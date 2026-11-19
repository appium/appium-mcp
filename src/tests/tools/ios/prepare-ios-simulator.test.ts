import {afterEach, beforeEach, expect, jest, test} from '@jest/globals';

const getEnv = jest.fn<(udid: string, name: string) => Promise<string>>();
const exec = jest.fn<(...args: any[]) => Promise<{stdout: string}>>();
jest.unstable_mockModule('teen_process', () => ({exec}));

const boot = jest.fn<(udid: string) => Promise<void>>();
const waitForBoot = jest.fn<(udid: string, options: {timeoutMs: number}) => Promise<void>>();
const installApp = jest.fn<(...args: any[]) => Promise<void>>();
const launchApp = jest.fn<(...args: any[]) => Promise<void>>();
const terminateApp = jest.fn<(...args: any[]) => Promise<void>>();
const isAppInstalled = jest.fn<(...args: any[]) => Promise<boolean>>();
const listProcesses = jest.fn<(udid: string) => Promise<{name: string}[]>>();
jest.unstable_mockModule('@appium/coresim', () => ({
  NativeSimctl: class {
    getEnv = getEnv;
    bootDevice = boot;
    waitForBoot = waitForBoot;
    installApp = installApp;
    launchApp = launchApp;
    terminateApp = terminateApp;
    isAppInstalled = isAppInstalled;
    listProcesses = listProcesses;
  },
}));
const listSimulators = jest.fn<() => Promise<any[]>>();
const hasAccess = jest.fn<(path: string) => Promise<boolean>>();
const downloadFile = jest.fn<(...args: any[]) => Promise<void>>();
jest.unstable_mockModule('appium-webdriveragent/package.json', () => ({
  default: {
    name: 'appium-webdriveragent',
    version: '16.17.7',
    repository: {url: 'https://github.com/appium/appium-ios.git', directory: 'packages/webdriveragent'},
  },
}));
const releaseReservedPort = jest.fn();

jest.unstable_mockModule('../../../logger.js', () => ({default: {info: jest.fn(), warn: jest.fn(), error: jest.fn()}}));

jest.unstable_mockModule('../../../devicemanager/ios-manager.js', () => ({
  IOSManager: {getInstance: () => ({listSimulators})},
}));
jest.unstable_mockModule('../../../utils/ports.js', () => ({
  findFreePort: jest.fn(async () => 8201),
  releaseReservedPort,
}));
jest.unstable_mockModule('@appium/support', () => ({
  fs: {
    hasAccess,
    mkdirp: jest.fn(),
    rimraf: jest.fn(),
    unlink: jest.fn(),
  },
  net: {downloadFile},
  zip: {extractAllTo: jest.fn()},
  plist: {parsePlistFile: jest.fn(async () => ({CFBundleIdentifier: 'custom.WebDriverAgentRunner'}))},
}));
const {default: register} = await import('../../../tools/ios/prepare-ios-simulator.js');
let execute: (args: any) => Promise<any>;
register({
  addTool: (tool: any) => {
    execute = tool.execute;
  },
} as any);
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
const originalWdaPath = process.env.APPIUM_MCP_WDA_APP_PATH;

beforeEach(() => {
  jest.clearAllMocks();
  hasAccess.mockResolvedValue(true);
  getEnv.mockResolvedValue('arm64');
  exec.mockResolvedValue({stdout: '0'});
  Object.defineProperty(process, 'platform', {value: 'darwin'});
  process.env.APPIUM_MCP_WDA_APP_PATH = '/mock/WDA.app';
  listSimulators.mockResolvedValue([{name: 'iPhone', udid: 'sim', state: 'Shutdown'}]);
  boot.mockResolvedValue();
  waitForBoot.mockResolvedValue();
  isAppInstalled.mockResolvedValue(false);
  listProcesses.mockResolvedValue([]);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/releases/latest')) {
      return new Response(null, {
        status: 302,
        headers: {location: 'https://github.com/appium/WebDriverAgent/releases/tag/v16.15.3'},
      });
    }
    return new Response(null, {status: 200});
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(process, 'platform', originalPlatform);
  if (originalWdaPath === undefined) {
    delete process.env.APPIUM_MCP_WDA_APP_PATH;
  } else {
    process.env.APPIUM_MCP_WDA_APP_PATH = originalWdaPath;
  }
});
async function prepare(args: any = {}) {
  const response = await execute({udid: 'sim', ...args});
  return JSON.parse(response.content[0].text);
}

test('waits for boot completion before reporting readiness', async () => {
  expect((await prepare({skipWda: true})).ready).toBe(true);
  expect(boot).toHaveBeenCalledWith('sim');
  expect(boot).toHaveBeenCalledTimes(1);
  expect(waitForBoot).toHaveBeenCalledWith('sim', {timeoutMs: 120000});
  expect(boot.mock.invocationCallOrder[0]).toBeLessThan(waitForBoot.mock.invocationCallOrder[0]);
});

test('skips booting an already booted simulator', async () => {
  listSimulators.mockResolvedValue([{name: 'iPhone', udid: 'sim', state: 'Booted'}]);
  expect((await prepare({skipWda: true})).boot.status).toBe('skipped');
  expect(boot).not.toHaveBeenCalled();
});

test('reports boot monitor failure without proceeding to WDA', async () => {
  waitForBoot.mockRejectedValue(new Error('boot timed out'));
  const result = await prepare();
  expect(result.ready).toBe(false);
  expect(result.boot).toEqual({status: 'failed', detail: 'boot timed out'});
  expect(installApp).not.toHaveBeenCalled();
});

test('installs the selected WDA bundle and passes its reserved port in the native environment', async () => {
  const result = await prepare();
  expect(result.ready).toBe(true);
  expect(isAppInstalled).toHaveBeenCalledWith('sim', 'custom.WebDriverAgentRunner');
  expect(installApp).toHaveBeenCalledWith('sim', '/mock/WDA.app');
  expect(launchApp).toHaveBeenCalledWith('sim', 'custom.WebDriverAgentRunner', {environment: {USE_PORT: '8201'}});
  expect(result.webDriverAgentUrl).toBe('http://127.0.0.1:8201');
  expect(releaseReservedPort).toHaveBeenCalledWith(8201);
});

test('relaunches an installed, running WDA without reinstalling', async () => {
  isAppInstalled.mockResolvedValue(true);
  listProcesses.mockResolvedValue([{name: 'custom.WebDriverAgentRunner'}]);
  expect((await prepare()).ready).toBe(true);
  expect(installApp).not.toHaveBeenCalled();
  expect(terminateApp).toHaveBeenCalledWith('sim', 'custom.WebDriverAgentRunner');
  expect(terminateApp.mock.invocationCallOrder[0]).toBeLessThan(launchApp.mock.invocationCallOrder[0]);
});

test('reads simulator architectures through coresim when resolving cached WDA', async () => {
  delete process.env.APPIUM_MCP_WDA_APP_PATH;
  getEnv.mockResolvedValue('  arm64   x86_64\n');
  const result = await prepare();
  expect(result.ready).toBe(true);
  expect(getEnv).toHaveBeenCalledWith('sim', 'SIMULATOR_ARCHS');
  expect(exec).toHaveBeenCalledTimes(1);
  expect(exec).toHaveBeenCalledWith('sysctl', ['-in', 'sysctl.proc_translated']);
});

test.each(['', '   \n'])('rejects an empty architecture value (%j)', async (value) => {
  delete process.env.APPIUM_MCP_WDA_APP_PATH;
  getEnv.mockResolvedValue(value);
  const result = await prepare();
  expect(result.ready).toBe(false);
  expect(result.wda_download).toEqual({status: 'failed', detail: 'No architectures reported for simulator sim'});
  expect(installApp).not.toHaveBeenCalled();
});

test('reports native environment lookup errors', async () => {
  delete process.env.APPIUM_MCP_WDA_APP_PATH;
  getEnv.mockRejectedValue(new Error('Simulator unavailable'));
  const result = await prepare();
  expect(result.ready).toBe(false);
  expect(result.wda_download).toEqual({status: 'failed', detail: 'Simulator unavailable'});
  expect(installApp).not.toHaveBeenCalled();
});

test('reuses the installed WDA version from the simulator cache', async () => {
  delete process.env.APPIUM_MCP_WDA_APP_PATH;
  const result = await prepare();
  expect(result.wda_download.detail).toContain('WDA v16.17.7 already cached');
  expect(downloadFile).not.toHaveBeenCalled();
});

test('downloads the installed WDA when only an older version is cached', async () => {
  delete process.env.APPIUM_MCP_WDA_APP_PATH;
  hasAccess.mockImplementation(async (file) => !file.includes('/16.17.7/') || downloadFile.mock.calls.length > 0);
  const result = await prepare();
  expect(result.wda_download.detail).toContain('WDA v16.17.7 downloaded');
  expect(downloadFile).toHaveBeenCalledTimes(1);
});

test.each([
  ['ios', 'arm64', 'WebDriverAgentRunner-Build-Sim-arm64.zip'],
  ['tvos', 'x86_64', 'WebDriverAgentRunner_tvOS-Build-Sim-x86_64.zip'],
])('downloads the installed release for %s on %s', async (platform, arch, asset) => {
  delete process.env.APPIUM_MCP_WDA_APP_PATH;
  getEnv.mockResolvedValue(arch);
  const result = await prepare({platform, forceRefreshWda: true});
  expect(result.wda_download.status).toBe('completed');
  expect(downloadFile.mock.calls[0][0]).toBe(
    `https://github.com/appium/appium-ios/releases/download/appium-webdriveragent@16.17.7/${asset}`,
  );
});
