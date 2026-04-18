import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../session-store.js';
import { getDriver } from '../session-store.js';

/**
 * Normalizes unknown errors into a message string for tool responses.
 */
export function toolErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Standard success ContentResult.
 */
export function textResult(text: string): ContentResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Standard error ContentResult. Sets isError so MCP clients can handle
 * failures consistently without throwing (which adds an unhelpful prefix).
 */
export function errorResult(text: string): ContentResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export type DriverOrError =
  | { ok: true; driver: DriverInstance }
  | { ok: false; result: ContentResult };

/**
 * Resolves the driver for a tool call or returns a standardised error result.
 * Named resolveDriver (not requireDriver / getDriverOrThrow) to make clear
 * it never throws.
 */
export function resolveDriver(sessionId?: string): DriverOrError {
  const driver = getDriver(sessionId);
  if (!driver) {
    const ctx = sessionId ? ` for session '${sessionId}'` : '';
    return {
      ok: false,
      result: errorResult(
        `No active driver session${ctx}. Call create_session first or pass a valid sessionId.`
      ),
    };
  }
  return { ok: true, driver };
}

/**
 * Returns a standard error result for platform-mismatch cases
 * (e.g. shake is iOS-only, open-notifications is Android-only).
 */
export function platformMismatch(
  action: string,
  expected: string,
  actual: string
): ContentResult {
  return errorResult(
    `action=${action} is ${expected}-only. Current session platform is '${actual}'.`
  );
}
