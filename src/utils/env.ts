const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isTruthyEnvValue(value: string | undefined): boolean {
  return TRUE_VALUES.has(value?.trim().toLowerCase() ?? '');
}
