import {afterEach, expect, jest, test} from '@jest/globals';

const downloadFile = jest.fn<(...args: any[]) => Promise<void>>();
const wdaPackage = {version: '', repository: {url: ''}};

jest.unstable_mockModule('appium-webdriveragent/package.json', () => ({default: wdaPackage}));
jest.unstable_mockModule('@appium/support', () => ({
  fs: {
    hasAccess: async (path: string) => path.endsWith('Provisioning Profiles'),
    readdir: async () => ['test.mobileprovision'],
    mkdirp: jest.fn(),
    rimraf: jest.fn(),
  },
  net: {downloadFile},
  plist: {},
  zip: {},
}));
jest.unstable_mockModule('ios-mobileprovision-finder', () => ({
  provision: {
    readFromFile: () => ({UUID: 'test-profile', Name: 'Test: *'}),
  },
}));
jest.unstable_mockModule('../../../logger.js', () => ({default: {info: jest.fn(), error: jest.fn()}}));
jest.unstable_mockModule('../../../devicemanager/ios-manager.js', () => ({
  IOSManager: {getInstance: () => ({listRealDevices: async () => [{udid: 'device'}]})},
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
});

test.each([
  ['16.15.3', 'git+https://github.com/appium/WebDriverAgent.git', 'WebDriverAgent', 'v16.15.3'],
  ['16.16.0', 'https://github.com/appium/appium-ios.git', 'appium-ios', 'appium-webdriveragent@16.16.0'],
])('resolves the real-device archive for installed WDA %s', async (version, repositoryUrl, repository, tag) => {
  Object.defineProperty(process, 'platform', {value: 'darwin'});
  wdaPackage.version = version;
  wdaPackage.repository.url = repositoryUrl;
  jest.resetModules();
  downloadFile.mockReset().mockRejectedValue(new Error('Download unavailable'));
  const {default: register} = await import('../../../tools/ios/prepare-ios-real-device.js');
  let execute!: (args: any) => Promise<any>;
  register({
    addTool: (tool: any) => {
      execute = tool.execute;
    },
  } as any);

  const response = await execute({udid: 'device', provisioningProfileUuid: 'test-profile'});
  const result = JSON.parse(response.content[0].text);
  expect(result.wda_download).toEqual({status: 'failed', detail: 'Download unavailable'});
  expect(downloadFile.mock.calls[0][0]).toBe(
    `https://github.com/appium/${repository}/releases/download/${tag}/WebDriverAgentRunner-Runner.zip`,
  );
});
