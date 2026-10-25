import {randomUUID} from 'node:crypto';

import type {ContentResult} from 'fastmcp';

import pkg from '../../package.json' with {type: 'json'};

/**
 * Structured, machine-readable trace of a single tool action, so CI and agents
 *  can diagnose failures without parsing prose.
 *
 * This is an *action* record. A future run-level bundle may reference many of
 * these plus heavier artifacts (screenshots, page source).
 */
export interface ActionEvidenceRecord {
  schemaVersion: 1;
  producer: {name: 'appium-mcp'; version: string};
  evidenceId: string;
  status: 'success' | 'error';
  /**
   * Action-specific details. `stage`/`locator`/`element` are optional because
   * they only apply to tools that resolve or interact with elements (find,
   * gesture); tools like screenshot carry just `name`.
   */
  action: {
    name: string;
    stage?: EvidenceStage;
    locator?: {strategy: string; selector: string};
    element?: {webdriverId: string};
  };
  context?: {
    platform?: string;
    contextName?: string;
  };
  timing: {startedAt: string; finishedAt: string; durationMs: number};
  error?: {code: EvidenceErrorCode; message: string};
  /**
   * Diagnostic hypothesis explaining why a failure likely occurred, paired with
   * supporting signals observed in the action inputs/context. Omitted on success.
   */
  reason?: FailureReasonHypothesis;
}

export interface FailureReasonHypothesis {
  hypothesis: string;
  confidence: number;
  signals: string[];
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
  name: string;
  startedAt: number;
  stage?: EvidenceStage;
  locator?: ActionEvidenceRecord['action']['locator'];
  element?: ActionEvidenceRecord['action']['element'];
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
export function withEvidence(result: ContentResult, input: EvidenceInput): ContentResult {
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
 * Snapshot the active session's platform and current context for the evidence
 * record. Returns undefined when there is no session to read, so the field is
 * simply omitted. The session-store import is deferred until evidence is
 * enabled so the disabled path pulls in no driver dependencies.
 */
export async function evidenceContext(sessionId?: string): Promise<ActionEvidenceRecord['context'] | undefined> {
  if (!isEvidenceEnabled()) {
    return undefined;
  }
  const {getSessionInfo} = await import('../session-store.js');
  const info = getSessionInfo(sessionId);
  if (!info) {
    return undefined;
  }
  return {
    ...(info.metadata.platform ? {platform: info.metadata.platform} : {}),
    ...(info.currentContext ? {contextName: info.currentContext} : {}),
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

function buildRecord(result: ContentResult, input: EvidenceInput): ActionEvidenceRecord {
  const finished = Date.now();
  const status: ActionEvidenceRecord['status'] = result.isError || input.error !== undefined ? 'error' : 'success';
  const error = status === 'error' ? buildError(input.error, result) : undefined;
  const reason = error ? inferFailureReason(error, input) : undefined;

  return {
    schemaVersion: 1,
    producer: {name: 'appium-mcp', version: pkg.version},
    evidenceId: randomUUID(),
    status,
    action: {
      name: input.name,
      ...(input.stage ? {stage: input.stage} : {}),
      ...(input.locator ? {locator: input.locator} : {}),
      ...(input.element ? {element: input.element} : {}),
    },
    ...(input.context ? {context: input.context} : {}),
    timing: {
      startedAt: new Date(input.startedAt).toISOString(),
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - input.startedAt,
    },
    ...(error ? {error} : {}),
    ...(reason ? {reason} : {}),
  };
}

const NATIVE_ONLY_STRATEGIES = new Set([
  'accessibility id',
  '-android uiautomator',
  '-ios predicate string',
  '-ios class chain',
]);

/**
 * Generate a diagnostic failure-reason hypothesis and supporting signals from
 * a classified error and the action context. Clearly marked as a hypothesis
 * rather than ground-truth root cause.
 */
export function inferFailureReason(
  error: NonNullable<ActionEvidenceRecord['error']>,
  input: Pick<EvidenceInput, 'name' | 'stage' | 'locator' | 'element' | 'context'>,
): FailureReasonHypothesis {
  const {locator, element, context, stage} = input;
  const contextName = context?.contextName;
  const platform = context?.platform?.toLowerCase();

  switch (error.code) {
    case 'ELEMENT_NOT_FOUND': {
      if (contextName === 'NATIVE_APP' && locator?.strategy === 'css selector') {
        return {
          hypothesis:
            "A CSS selector was used while the active context is 'NATIVE_APP'; switch to a WEBVIEW context or use a native locator strategy.",
          confidence: 0.85,
          signals: [
            'error code is ELEMENT_NOT_FOUND',
            "active context is 'NATIVE_APP' while using WebView strategy 'css selector'",
          ],
        };
      }
      if (contextName && contextName !== 'NATIVE_APP' && locator && NATIVE_ONLY_STRATEGIES.has(locator.strategy)) {
        return {
          hypothesis: `A native locator strategy ('${locator.strategy}') was used while the active context is '${contextName}'; switch to 'NATIVE_APP' or use a DOM selector.`,
          confidence: 0.85,
          signals: [
            'error code is ELEMENT_NOT_FOUND',
            `active context is '${contextName}' while using native locator strategy '${locator.strategy}'`,
          ],
        };
      }
      const signals = ['error code is ELEMENT_NOT_FOUND'];
      if (locator) {
        signals.push(`no element matched ${locator.strategy}=${locator.selector}`);
      }
      if (contextName) {
        signals.push(`active context is '${contextName}'`);
      }
      if (locator?.strategy === 'xpath') {
        signals.push('xpath selectors are sensitive to UI hierarchy changes');
        return {
          hypothesis:
            'No element matched the XPath selector; the UI hierarchy may have changed, the screen may still be loading, or the element is off-screen.',
          confidence: 0.65,
          signals,
        };
      }
      return {
        hypothesis:
          'The target element was not found in the current UI hierarchy; the screen may still be loading, the element may be off-screen or hidden behind a modal, or the locator is stale.',
        confidence: 0.65,
        signals,
      };
    }

    case 'STALE_ELEMENT': {
      const signals = ['error code is STALE_ELEMENT'];
      if (element?.webdriverId) {
        signals.push(`element '${element.webdriverId}' is no longer attached to the current UI hierarchy`);
      }
      return {
        hypothesis:
          'The UI hierarchy re-rendered or navigated after the element was located, invalidating the cached element reference; re-locate the element before retrying.',
        confidence: 0.9,
        signals,
      };
    }

    case 'TIMEOUT': {
      const signals = ['error code is TIMEOUT'];
      if (stage) {
        signals.push(`timed out during '${stage}' stage`);
      }
      if (locator) {
        signals.push(`waiting on ${locator.strategy}=${locator.selector}`);
      }
      return {
        hypothesis:
          'The operation timed out waiting for the device or UI to respond; the app may be busy, animating, blocked by a dialog, or the target condition was not met in time.',
        confidence: 0.7,
        signals,
      };
    }

    case 'CONTEXT_NOT_AVAILABLE': {
      const signals = ['error code is CONTEXT_NOT_AVAILABLE'];
      if (contextName) {
        signals.push(`active context is '${contextName}'`);
      }
      return {
        hypothesis:
          'The requested context is not available; the WebView may not have loaded yet, WebView debugging may be disabled, or the context was closed.',
        confidence: 0.8,
        signals,
      };
    }

    case 'INVALID_SELECTOR': {
      if (
        (platform === 'ios' && locator?.strategy === '-android uiautomator') ||
        (platform === 'android' &&
          (locator?.strategy === '-ios predicate string' || locator?.strategy === '-ios class chain'))
      ) {
        return {
          hypothesis: `Locator strategy '${locator.strategy}' is not supported on platform '${context?.platform}'.`,
          confidence: 0.9,
          signals: [
            'error code is INVALID_SELECTOR',
            `strategy '${locator.strategy}' is not supported on platform '${context?.platform}'`,
          ],
        };
      }
      const signals = ['error code is INVALID_SELECTOR'];
      if (locator) {
        signals.push(`driver rejected ${locator.strategy} selector '${locator.selector}'`);
      }
      return {
        hypothesis: `The selector syntax is malformed or unsupported by the active driver for strategy '${locator?.strategy ?? 'unknown'}'.`,
        confidence: 0.85,
        signals,
      };
    }

    case 'ACTION_FAILED': {
      if (/intercepted|obscured|not visible|not interactable|cannot be clicked|not hittable/i.test(error.message)) {
        return {
          hypothesis:
            'The target element could not be interacted with because it is disabled, off-screen, or obscured by another view (such as a modal, keyboard, or overlay).',
          confidence: 0.75,
          signals: ['error code is ACTION_FAILED', 'driver reported target element is not interactable or is obscured'],
        };
      }
      const signals = ['error code is ACTION_FAILED'];
      if (stage) {
        signals.push(`failed during '${stage}' stage`);
      }
      return {
        hypothesis: `The driver rejected the '${input.name}' action; the current screen or element state may not support this operation.`,
        confidence: 0.5,
        signals,
      };
    }
  }
}

/**
 * Resolve the error message, then classify from the same source so the code
 * and message always agree — handlers that swallow errors only expose the
 * result text, so fall back to that when no error object is passed.
 */
function buildError(err: unknown, result: ContentResult): NonNullable<ActionEvidenceRecord['error']> {
  const message = errorMessage(err, result);
  return {code: classifyError(err ?? message), message};
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
