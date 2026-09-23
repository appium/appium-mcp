import {afterEach, beforeEach, expect, jest, test} from '@jest/globals';

const mockExecute = jest.fn<(...args: any[]) => Promise<void>>();
let remote = false;
let platform = 'Android';
const driver = {};
jest.unstable_mockModule('../../../command.js', () => ({execute: mockExecute}));
jest.unstable_mockModule('../../../session-store.js', () => ({
  getPlatformName: () => platform,
  isRemoteDriverSession: () => remote,
  PLATFORM: {android: 'Android', ios: 'iOS'},
}));
jest.unstable_mockModule('../../../tools/tool-response.js', () => ({
  resolveDriver: async () => ({ok: true, driver}),
  textResult: (text: string) => ({content: [{type: 'text', text}]}),
  errorResult: (text: string) => ({isError: true, content: [{type: 'text', text}]}),
  toolErrorMessage: (err: Error) => err.message,
}));
jest.unstable_mockModule('../../../tools/app-management/resolve-app-id.js', () => ({
  invalidateAppListCache: jest.fn(),
}));
const {install} = await import('../../../tools/app-management/install-app.js');
const originalEnv = {...process.env};
beforeEach(() => {
  mockExecute.mockClear();
  remote = false;
  platform = 'Android';
  process.env.ALLOW_REMOTE_APP_URLS = 'false';
});
afterEach(() => {
  process.env = {...originalEnv};
});

test.each(['Android', 'iOS'])('blocks embedded %s URL installs before execute', async (name) => {
  platform = name;
  expect((await install('https://example.test/app.apk')).isError).toBe(true);
  expect(mockExecute).not.toHaveBeenCalled();
});

test.each(['Android', 'iOS'])('preserves local %s installs', async (name) => {
  platform = name;
  expect((await install('/tmp/app.apk')).isError).not.toBe(true);
  expect(mockExecute).toHaveBeenCalledWith(
    driver,
    'mobile: installApp',
    name === 'Android' ? {appPath: '/tmp/app.apk'} : {app: '/tmp/app.apk'},
  );
});

test('leaves remote session app inputs to the remote server', async () => {
  remote = true;
  expect((await install('https://example.test/app.apk')).isError).not.toBe(true);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test.each([undefined, 'true'])('preserves embedded URL installation with %s', async (value) => {
  if (value === undefined) {
    delete process.env.ALLOW_REMOTE_APP_URLS;
  } else {
    process.env.ALLOW_REMOTE_APP_URLS = value;
  }
  expect((await install('https://example.test/app.apk')).isError).not.toBe(true);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});
