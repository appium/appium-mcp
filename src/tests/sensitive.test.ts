import { describe, expect, test } from '@jest/globals';

import { isSensitiveKey } from '../utils/sensitive.js';

describe('sensitive key matching', () => {
  test('matches common secret key variants', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('client-secret')).toBe(true);
    expect(isSensitiveKey('remoteServerUrl')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
  });

  test('does not match ordinary input names', () => {
    expect(isSensitiveKey('platformName')).toBe(false);
    expect(isSensitiveKey('sessionId')).toBe(false);
    expect(isSensitiveKey('elementId')).toBe(false);
  });
});
