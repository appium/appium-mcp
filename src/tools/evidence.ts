import { randomUUID } from 'node:crypto';
import type { ContentResult } from 'fastmcp';
import pkg from '../../package.json' with { type: 'json' };
import { getSessionInfo } from '../session-store.js';

/**
 * Structured, machine-readable trace of a single tool action, so CI and agents
 *  can diagnose failures without parsing prose.
 *
 * This is an *action* record. A future run-level bundle may reference many of
 * these plus heavier artifacts (screenshots, page source).
 */
export interface ActionEvidenceRecord {
  schemaVersion: 1;
  producer: { name: 'appium-mcp'; version: string };
  evidenceId: string;
  toolName: string;
  status: 'success' | 'error';
  /** Phase the action reached when it ended (most useful on failure). */
  stage: EvidenceStage;
  locator?: { strategy: string; selector: string };
  element?: { webdriverId: string };
  context?: {
    platform?: string;
    appPackageOrBundle?: string;
    contextName?: string;
  };
  timing: { startedAt: string; finishedAt: string; durationMs: number };
  error?: { code: EvidenceErrorCode; message: string };
}

export type EvidenceStage = 'locate' | 'interact' | 'capture';

export type EvidenceErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'TIMEOUT'
  | 'STALE_ELEMENT'
  | 'CONTEXT_NOT_AVAILABLE'
  | 'INVALID_SELECTOR'
  | 'ACTION_FAILED';

const EVIDENCE_MIME_TYPE = 'application/vnd.appium.evidence+json';

/** Inputs a handler supplies to describe the action it performed. */
export interface EvidenceInput {
  toolName: string;
  stage: EvidenceStage;
  startedAt: number;
  locator?: ActionEvidenceRecord['locator'];
  element?: ActionEvidenceRecord['element'];
  context?: ActionEvidenceRecord['context'];
  error?: unknown;
}

/**
 * When disabled, evidence is never built or attached and tool
 * responses are byte-for-byte unchanged.
 */
export function isEvidenceEnabled(): boolean {
  const raw = process.env.APPIUM_MCP_EVIDENCE?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

/**
 * Attach an evidence record to an existing tool result as a `resource` content
 * block, leaving the original text untouched. No-op when evidence is disabled.
 */
export function withEvidence(
  result: ContentResult,
  input: EvidenceInput
): ContentResult {
  if (!isEvidenceEnabled()) {
    return result;
  }
  const record = buildRecord(result, input);
  return {
    ...result,
    content: [
      ...result.content,
      {
        type: 'resource',
        resource: {
          uri: `evidence://${record.evidenceId}`,
          mimeType: EVIDENCE_MIME_TYPE,
          text: JSON.stringify(record),
        },
      },
    ],
  };
}

/**
 * Snapshot the active session's platform, app id, and current context for the
 * evidence record. Returns undefined when there is no session to read, so the
 * field is simply omitted.
 */
export function evidenceContext(
  sessionId?: string
): ActionEvidenceRecord['context'] | undefined {
  if (!isEvidenceEnabled()) {
    return undefined;
  }
  const info = getSessionInfo(sessionId);
  if (!info) {
    return undefined;
  }
  const caps = info.metadata.capabilities;
  const appPackageOrBundle =
    caps.appPackage ?? caps['appium:bundleId'] ?? caps.bundleId ?? caps.app;
  return {
    ...(info.metadata.platform ? { platform: info.metadata.platform } : {}),
    ...(appPackageOrBundle
      ? { appPackageOrBundle: String(appPackageOrBundle) }
      : {}),
    ...(info.currentContext ? { contextName: info.currentContext } : {}),
  };
}

/**
 * Map a raw Appium/WebDriver error to a stable, normalized code. The codes are
 * also the foundation for failure-reason hypotheses. Inspects the error name
 * first, then the message, falling back to ACTION_FAILED.
 */
export function classifyError(err: unknown): EvidenceErrorCode {
  const name = err instanceof Error ? err.name : '';
  const message = (err instanceof Error ? err.message : String(err)) ?? '';
  const haystack = `${name} ${message}`.toLowerCase();

  if (/no such element|could not be located|element not found/.test(haystack)) {
    return 'ELEMENT_NOT_FOUND';
  }
  if (/stale element/.test(haystack)) {
    return 'STALE_ELEMENT';
  }
  if (/timed? ?out|timeout/.test(haystack)) {
    return 'TIMEOUT';
  }
  if (/no such context|context.*not.*(found|available)/.test(haystack)) {
    return 'CONTEXT_NOT_AVAILABLE';
  }
  if (/invalid selector|invalid.*(locator|xpath)/.test(haystack)) {
    return 'INVALID_SELECTOR';
  }
  return 'ACTION_FAILED';
}

function buildRecord(
  result: ContentResult,
  input: EvidenceInput
): ActionEvidenceRecord {
  const finished = Date.now();
  const status: ActionEvidenceRecord['status'] =
    result.isError || input.error !== undefined ? 'error' : 'success';

  return {
    schemaVersion: 1,
    producer: { name: 'appium-mcp', version: pkg.version },
    evidenceId: randomUUID(),
    toolName: input.toolName,
    status,
    stage: input.stage,
    ...(input.locator ? { locator: input.locator } : {}),
    ...(input.element ? { element: input.element } : {}),
    ...(input.context ? { context: input.context } : {}),
    timing: {
      startedAt: new Date(input.startedAt).toISOString(),
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - input.startedAt,
    },
    ...(status === 'error' ? { error: buildError(input.error, result) } : {}),
  };
}

/**
 * Resolve the error message, then classify from the same source so the code
 * and message always agree — handlers that swallow errors only expose the
 * result text, so fall back to that when no error object is passed.
 */
function buildError(
  err: unknown,
  result: ContentResult
): NonNullable<ActionEvidenceRecord['error']> {
  const message = errorMessage(err, result);
  return { code: classifyError(err ?? message), message };
}

function errorMessage(err: unknown, result: ContentResult): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err !== undefined) {
    return String(err);
  }
  const text = result.content.find((c) => c.type === 'text');
  return text && 'text' in text ? text.text : 'Unknown error';
}
