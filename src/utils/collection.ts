export function isNil(value: unknown): value is null | undefined {
  return value == null;
}

export function isEmpty(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

export function omitNilValues(
  values: Record<string, string | null>
): Record<string, string> {
  const filteredValues: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    if (!isNil(value)) {
      filteredValues[key] = value;
    }
  }

  return filteredValues;
}
