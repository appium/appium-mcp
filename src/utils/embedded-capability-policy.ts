type Caps = Record<string, unknown>;

function isRecord(value: unknown): value is Caps {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function capabilityName(key: string): string {
  return key.replace(/^appium:/, '');
}

function readRules(policy: unknown) {
  const rules = new Map<string, 'ignore' | 'reject'>();
  if (policy === undefined) {
    return rules;
  }
  if (!isRecord(policy)) {
    throw new Error('CAPABILITIES_CONFIG $toolInput must be an object.');
  }

  for (const [action, names] of Object.entries(policy)) {
    if ((action !== 'ignore' && action !== 'reject') || !Array.isArray(names)) {
      throw new Error('CAPABILITIES_CONFIG $toolInput accepts reject and ignore lists of capability names.');
    }
    for (const key of names) {
      if (typeof key !== 'string' || !key.trim() || key.trim() !== key || !capabilityName(key)) {
        throw new Error(`Invalid capability name in CAPABILITIES_CONFIG $toolInput.${action}.`);
      }
      const name = capabilityName(key);
      if (rules.has(name) && rules.get(name) !== action) {
        throw new Error(`Conflicting CAPABILITIES_CONFIG $toolInput rules for ${key}.`);
      }
      rules.set(name, action);
    }
  }
  return rules;
}

export function resolveSessionCapabilities(config: Caps | null = {}, supplied: Caps = {}, embedded: boolean) {
  const {$toolInput, ...defaults} = config ?? {};
  if (!embedded) {
    return {defaults, custom: supplied};
  }

  const rules = readRules($toolInput);
  if (!rules.size) {
    return {defaults, custom: supplied};
  }
  const actionFor = (key: string) => rules.get(capabilityName(key));
  const keep = ([key]: [string, unknown]) => {
    const action = actionFor(key);
    if (action === 'reject') {
      throw new Error(
        `Tool-supplied capability ${key} is restricted for embedded sessions. Omit it or configure it in CAPABILITIES_CONFIG.`,
      );
    }
    return action !== 'ignore';
  };
  const custom = Object.fromEntries(Object.entries(supplied).filter(keep));
  const options = custom['appium:options'];
  if (isRecord(options)) {
    // The builders shallow-merge this group. Preserve operator-owned entries
    // when the caller supplies unrelated options in the same group.
    const configuredOptions = defaults['appium:options'];
    const protectedOptions = isRecord(configuredOptions)
      ? Object.entries(configuredOptions).filter(([key]) => actionFor(key))
      : [];
    custom['appium:options'] = Object.fromEntries([...Object.entries(options).filter(keep), ...protectedOptions]);
  } else if (options !== undefined) {
    throw new Error('appium:options must be an object for embedded sessions.');
  }
  return {defaults, custom};
}
