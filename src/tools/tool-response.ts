import type { ContentResult } from 'fastmcp';
import type { DriverInstance } from '../session-store.js';
import { getDriver } from '../session-store.js';

const W3C_ELEMENT_ID = 'element-6066-11e4-a52e-4f735466cecf';

/**
 * Normalizes unknown errors into a message string for tool responses.
 */
export function toolErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reads the WebDriver element id from a findElement/activeElement payload,
 * or returns the value when the driver already returned a plain id string.
 */
export function readWebElementId(element: unknown): string | undefined {
  if (typeof element === 'string') {
    return element;
  }
  if (element === null || typeof element !== 'object') {
    return undefined;
  }
  const rec = element as Record<string, unknown>;
  const id = rec[W3C_ELEMENT_ID] ?? rec.ELEMENT;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Standard success ContentResult.
 */
export function textResult(text: string): ContentResult {
  return { content: [{ type: 'text', text }] };
}

function sanitizePrimaryElementIdLine(elementId: string): string {
  return elementId.replace(/[\r\n]+/g, '').trim();
}

/**
 * Canonical first line: machine-parseable `elementId:<value>`, then human-readable detail.
 * Strips newlines from elementId so the first line stays one logical field for parsers.
 */
export function textResultWithPrimaryElementId(
  elementId: string,
  detail: string
): ContentResult {
  const safeId = sanitizePrimaryElementIdLine(elementId);
  const d = detail.replace(/^\s+/, '');
  return textResult(`elementId:${safeId}\n${d}`);
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
 * Does not throw.
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
