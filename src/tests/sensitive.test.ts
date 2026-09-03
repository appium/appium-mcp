import {describe, expect, test} from '@jest/globals';

import {isSensitiveKey, redactForLogging, redactUrlCredentials} from '../utils/sensitive.js';

describe('sensitive key matching', () => {
  test('matches common secret key variants', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('client-secret')).toBe(true);
    expect(isSensitiveKey('remoteServerUrl')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
    expect(isSensitiveKey('sauce:accessKey')).toBe(true);
    expect(isSensitiveKey('private-key')).toBe(true);
  });

  test('does not match ordinary input names', () => {
    expect(isSensitiveKey('platformName')).toBe(false);
    expect(isSensitiveKey('sessionId')).toBe(false);
    expect(isSensitiveKey('elementId')).toBe(false);
  });

  test('redacts nested secret values and URL credentials for logging', () => {
    expect(
      redactForLogging({
        capabilities: {'sauce:options': {accessKey: 'cloud-secret'}},
        endpoint: 'https://alice:password@example.test/wd/hub',
      }),
    ).toEqual({
      capabilities: {'sauce:options': {accessKey: '[REDACTED]'}},
      endpoint: 'https://[REDACTED]@example.test/wd/hub',
    });
  });

  test('redacts credentials embedded in arbitrary error text', () => {
    expect(redactUrlCredentials('request to https://alice:password@example.test failed')).toBe(
      'request to https://[REDACTED]@example.test failed',
    );
  });
});
