import {afterEach, describe, expect, test} from '@jest/globals';

import {readBooleanEnv, validateConnectionPolicyEnv} from '../utils/env.js';
import {validateEmbeddedAppCapabilities, validateEmbeddedAppPath} from '../utils/remote-app-policy.js';

const originalEnv = {...process.env};
afterEach(() => {
  process.env = {...originalEnv};
});

describe('operator connection settings', () => {
  test.each(['ALLOW_REMOTE_APP_URLS', 'REMOTE_SERVER_ENABLE_DIRECT_CONNECT'])('%s defaults to true', (name) => {
    delete process.env[name];
    expect(readBooleanEnv(name, true)).toBe(true);
    process.env[name] = ' FALSE ';
    expect(readBooleanEnv(name, true)).toBe(false);
    process.env[name] = 'TRUE';
    expect(readBooleanEnv(name, true)).toBe(true);
  });

  test.each(['', '0', '1', 'typo'])('rejects invalid value %j at startup', (value) => {
    for (const name of ['ALLOW_REMOTE_APP_URLS', 'REMOTE_SERVER_ENABLE_DIRECT_CONNECT']) {
      delete process.env.ALLOW_REMOTE_APP_URLS;
      delete process.env.REMOTE_SERVER_ENABLE_DIRECT_CONNECT;
      process.env[name] = value;
      expect(validateConnectionPolicyEnv).toThrow(name);
    }
  });
});

describe('embedded app URL policy', () => {
  test.each([undefined, 'true'])('preserves URL support with %s', (value) => {
    if (value === undefined) {
      delete process.env.ALLOW_REMOTE_APP_URLS;
    } else {
      process.env.ALLOW_REMOTE_APP_URLS = value;
    }
    expect(() => validateEmbeddedAppPath('https://example.test/app.apk')).not.toThrow();
  });

  test.each([
    'http://example.test/a.apk',
    'HTTPS://example.test/a.ipa',
    ' https://example.test/a.apk ',
    'ht\ntps://example.test/a.apk',
  ])('rejects %j', (path) => {
    process.env.ALLOW_REMOTE_APP_URLS = 'false';
    expect(() => validateEmbeddedAppPath(path)).toThrow('ALLOW_REMOTE_APP_URLS=false');
  });

  test.each(['/tmp/a.apk', './a.app', 'C:\\apps\\a.apk', undefined])('allows local input %j', (path) => {
    process.env.ALLOW_REMOTE_APP_URLS = 'false';
    expect(() => validateEmbeddedAppPath(path)).not.toThrow();
  });

  test.each(['app', 'appium:app', 'otherApps', 'appium:otherApps'])('checks %s and grouped options', (key) => {
    process.env.ALLOW_REMOTE_APP_URLS = 'false';
    for (const value of [
      'https://example.test/a.apk',
      ['/tmp/a.apk', 'https://example.test/b.apk'],
      '["/tmp/a.apk","https://example.test/b.apk"]',
    ]) {
      expect(() => validateEmbeddedAppCapabilities({[key]: value})).toThrow('ALLOW_REMOTE_APP_URLS');
      expect(() => validateEmbeddedAppCapabilities({'appium:options': {[key]: value}})).toThrow(
        'ALLOW_REMOTE_APP_URLS',
      );
    }
    expect(() => validateEmbeddedAppCapabilities({[key]: '["/tmp/a.apk","/tmp/b.apk"]'})).not.toThrow();
  });
});
