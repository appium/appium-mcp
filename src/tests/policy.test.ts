import { describe, expect, test } from '@jest/globals';
import { evaluatePolicyTarget } from '../policy.js';

describe('policy allowlist evaluation', () => {
  test('allows all targets when the matching allowlist is empty', () => {
    expect(evaluatePolicyTarget(undefined, 'tool', 'anything')).toMatchObject({
      allowed: true,
      reason: 'empty_allowlist',
      targetKind: 'tool',
      target: 'anything',
    });
  });

  test('matches against the target name as provided', () => {
    expect(
      evaluatePolicyTarget(
        { allowTools: [/^appium_find_element$/] },
        'tool',
        'appium_find_element'
      )
    ).toMatchObject({
      allowed: true,
      reason: 'matched_allowlist',
      target: 'appium_find_element',
      matchedRule: '/^appium_find_element$/',
    });
  });

  test('does not trim or normalize target names before matching', () => {
    expect(
      evaluatePolicyTarget(
        { allowTools: [/^appium_find_element$/] },
        'tool',
        ' appium_find_element '
      )
    ).toMatchObject({
      allowed: false,
      reason: 'not_in_allowlist',
      target: ' appium_find_element ',
    });
  });

  test('denies targets outside a non-empty allowlist', () => {
    expect(
      evaluatePolicyTarget(
        { allowResources: [/^Generate Code With Locators$/] },
        'resource',
        'Device State'
      )
    ).toMatchObject({
      allowed: false,
      reason: 'not_in_allowlist',
      targetKind: 'resource',
      target: 'Device State',
    });
  });

  test('does not mutate stateful regex lastIndex while matching', () => {
    const rule = /^appium_/g;
    rule.lastIndex = 7;
    const policy = { allowTools: [rule] };

    expect(
      evaluatePolicyTarget(policy, 'tool', 'appium_session_management').allowed
    ).toBe(true);
    expect(
      evaluatePolicyTarget(policy, 'tool', 'appium_session_management').allowed
    ).toBe(true);
    expect(rule.lastIndex).toBe(7);
  });
});
