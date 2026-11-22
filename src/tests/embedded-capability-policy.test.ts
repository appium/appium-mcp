import {describe, expect, test} from '@jest/globals';

import {resolveSessionCapabilities} from '../utils/embedded-capability-policy.js';

describe('embedded capability policy', () => {
  const config = {
    $toolInput: {reject: ['appium:systemPort'], ignore: ['appium:remoteAdbHost', 'appium:adbListenAllNetwork']},
    'appium:adbListenAllNetwork': false,
    'appium:deviceName': 'ignore',
  };

  test.each([
    {'appium:avdEnv': {}},
    {avdEnv: {}},
    {'appium:options': {avdEnv: {}}},
    {'appium:options': {'appium:avdEnv': {}}},
  ])('applies only explicitly configured rules across spellings', (caps) => {
    expect(resolveSessionCapabilities({}, caps, true).custom).toEqual(caps);
    expect(() => resolveSessionCapabilities({$toolInput: {reject: ['avdEnv']}}, caps, true)).toThrow('avdEnv');
  });

  test('applies rules across spellings and preserves ordinary settings', () => {
    const supplied = {remoteAdbHost: 'other', 'appium:options': {adbListenAllNetwork: true, udid: 'device'}};
    expect(resolveSessionCapabilities(config, supplied, true)).toEqual({
      defaults: {'appium:deviceName': 'ignore', 'appium:adbListenAllNetwork': false},
      custom: {'appium:options': {udid: 'device'}},
    });
  });

  test.each([{}, {ignore: [], reject: []}, {reject: ['systemPort']}])(
    'allows unlisted tool overrides with policy %j',
    (policy) => {
      const defaults = {'appium:avdArgs': ['-no-window']};
      const input = {'appium:avdArgs': []};
      expect(resolveSessionCapabilities({...defaults, $toolInput: policy}, input, true)).toEqual({
        defaults,
        custom: input,
      });
    },
  );

  test.each([true, false])('treats a null platform preset as empty (embedded=%s)', (embedded) => {
    const input = {'appium:deviceName': 'test-device'};
    expect(resolveSessionCapabilities(null, input, embedded)).toEqual({defaults: {}, custom: input});
  });

  test('passes remote input through and omits embedded directives', () => {
    const supplied = {'appium:avdEnv': {}, 'appium:adbListenAllNetwork': true};
    expect(resolveSessionCapabilities(config, supplied, false)).toEqual({
      defaults: {'appium:deviceName': 'ignore', 'appium:adbListenAllNetwork': false},
      custom: supplied,
    });
  });

  test('rejects an operator-selected key in grouped caller input', () => {
    expect(() => resolveSessionCapabilities(config, {'appium:options': {systemPort: 8201}}, true)).toThrow(
      'systemPort',
    );
  });

  test('keeps a protected grouped preset when other tool options are supplied', () => {
    const presets = {...config, 'appium:options': {remoteAdbHost: 'operator-host'}};
    const {custom} = resolveSessionCapabilities(
      presets,
      {'appium:options': {remoteAdbHost: 'other', udid: 'device'}},
      true,
    );
    expect(custom['appium:options']).toEqual({remoteAdbHost: 'operator-host', udid: 'device'});
  });

  test.each([false, 0, '', null, [], {nested: true}])(
    'matches the supplied key regardless of its JSON value %j',
    (value) => {
      const supplied = {'appium:systemPort': value};
      expect(() => resolveSessionCapabilities(config, supplied, true)).toThrow('appium:systemPort');

      const {defaults, custom} = resolveSessionCapabilities(
        config,
        {
          'appium:adbListenAllNetwork': value,
          'appium:options': {adbListenAllNetwork: value, udid: 'device'},
        },
        true,
      );
      expect(custom).toEqual({'appium:options': {udid: 'device'}});
      expect(defaults['appium:adbListenAllNetwork']).toBe(false);
    },
  );

  test.each([undefined, {}, {ignore: []}, {reject: []}, {ignore: [], reject: []}])(
    'passes grouped input through with empty policy %j',
    (policy) => {
      const supplied = {'appium:options': {systemPort: 8201, remoteAdbHost: 'test-host'}};
      const presets = policy === undefined ? {} : {$toolInput: policy};
      expect(resolveSessionCapabilities(presets, supplied, true)).toEqual({defaults: {}, custom: supplied});
    },
  );

  test('keeps namespaces distinct and leaves nested capability data intact', () => {
    const supplied = {'other:systemPort': 8201, 'vendor:settings': {systemPort: 8202}};
    expect(resolveSessionCapabilities(config, supplied, true).custom).toEqual(supplied);
  });

  test.each([null, [], 'invalid', false])('reports a malformed options group %j when checking rules', (options) => {
    const supplied = {'appium:options': options};
    expect(resolveSessionCapabilities({}, supplied, true).custom).toEqual(supplied);
    expect(() => resolveSessionCapabilities(config, supplied, true)).toThrow('appium:options must be an object');
  });

  test.each([
    null,
    [],
    'reject',
    {ignore: 'name'},
    {allow: []},
    {reject: [false]},
    {ignore: ['']},
    {reject: [' ']},
    {ignore: ['appium:']},
    {reject: [' systemPort']},
    {ignore: ['systemPort ']},
    {ignore: ['name'], reject: ['appium:name']},
    {reject: ['appium:name'], ignore: ['name']},
  ])('rejects invalid policy %j', (policy) => {
    expect(() => resolveSessionCapabilities({$toolInput: policy}, {}, true)).toThrow('CAPABILITIES_CONFIG');
  });
});
