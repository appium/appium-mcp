export function isNil(value: unknown): value is null | undefined {
  return value == null;
}

export function isEmpty(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  // Keep behavior aligned with lodash: primitives/functions are treated as empty.
  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return true;
  }

  if (typeof value === 'string') {
    return value.length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isArguments(value) || isTypedArrayLike(value)) {
    return value.length === 0;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }

  return false;
}

export function omitNilValues<T>(
  values: Record<string, T | null | undefined>
): Record<string, T> {
  const filteredValues: Record<string, T> = {};

  for (const [key, value] of Object.entries(values)) {
    if (!isNil(value)) {
      filteredValues[key] = value;
    }
  }

  return filteredValues;
}

function isLength(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    value >= 0 &&
    value % 1 === 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function isArguments(value: unknown): value is IArguments {
  return Object.prototype.toString.call(value) === '[object Arguments]';
}

function isTypedArrayLike(value: unknown): value is { length: number } {
  if (!ArrayBuffer.isView(value)) {
    return false;
  }
  const maybeLength = (value as { length?: unknown }).length;
  return isLength(maybeLength);
}
