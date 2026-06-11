/**
 * Helpers for deciding whether telemetry is enabled and for building safe span
 * attributes. This file intentionally exposes only low-cardinality metadata and
 * filtered input names so spans do not capture secrets, screenshots, page
 * source XML, prompts, or other user payloads.
 */

import { isTruthyEnvValue } from '../utils/env.js';
import { isSensitiveKey } from '../utils/sensitive.js';
import { getSessionId } from '../session-store.js';

const MAX_ATTRIBUTE_VALUE_LENGTH = 2048;

/**
 * Determines whether telemetry is enabled based on the APPIUM_MCP_OTEL_ENABLED environment variable.
 * Recognizes "1", "true", "yes", and "on" (case-insensitive) as true values.
 * Defaults to false if the variable is not set or has an unrecognized value.
 * @returns True if telemetry is enabled, false otherwise.
 */
export function isTelemetryEnabled(): boolean {
  return isTruthyEnvValue(process.env.APPIUM_MCP_OTEL_ENABLED);
}

/**
 * Determines whether including argument values in telemetry attributes is enabled based on the APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES environment variable.
 * Recognizes "1", "true", "yes", and "on" (case-insensitive) as true values.
 * Defaults to false if the variable is not set or has an unrecognized value.
 * When false, argument values will not be included in telemetry attributes, even for non-sensitive keys.
 * When true, non-sensitive argument values will be included in telemetry attributes, while sensitive keys will still be excluded.
 * @see safeInputValueAttributes for how argument values are included in attributes when this is enabled.
 * @returns
 */
export function isArgumentValueTelemetryEnabled(): boolean {
  return isTruthyEnvValue(process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES);
}

/**
 * Safely converts a value to a string, number, or boolean for use as a telemetry attribute.
 * If the value is already a string, number, or boolean, it is returned as-is.
 * If the value is null or undefined, an empty string is returned.
 * Otherwise, the value is converted to a string.
 * @param value The value to convert.
 * @returns The safe attribute value.
 */
export function safeAttributeValue(value: unknown): string | number | boolean {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value == null) {
    return '';
  }

  try {
    const serialized = JSON.stringify(value, (key, val) =>
      key && isSensitiveKey(key) ? '[REDACTED]' : val
    );
    return truncateAttributeValue(serialized ?? String(value));
  } catch {
    return truncateAttributeValue(String(value));
  }
}

/**
 * Safely extracts the session ID from the given arguments.
 * Falls back to the active session ID when no string argument sessionId exists.
 * @param args The arguments object potentially containing a sessionId.
 * @returns The session ID if present and valid, otherwise undefined.
 */
export function safeSessionId(args: unknown): string | undefined {
  if (args && typeof args === 'object' && 'sessionId' in args) {
    const sessionId = (args as { sessionId?: unknown }).sessionId;
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      return sessionId;
    }
  }

  return getSessionId() ?? undefined;
}

/**
 * Safely extracts the input keys from the given arguments, excluding sensitive keys.
 * @param args The arguments object potentially containing input keys.
 * @returns An array of safe input keys.
 */
export function safeInputKeys(args: unknown): string[] {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return [];
  }

  return Object.keys(args)
    .filter((key) => !isSensitiveKey(key))
    .sort();
}

function truncateAttributeValue(value: string): string {
  return value.length > MAX_ATTRIBUTE_VALUE_LENGTH
    ? `${value.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH)}...`
    : value;
}
