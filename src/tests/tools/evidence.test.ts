import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import type {ContentResult} from 'fastmcp';

import type {ActionEvidenceRecord} from '../../tools/evidence.js';

// Mock the session store to avoid pulling in the native drivers it imports.
jest.unstable_mockModule('../../session-store', () => ({
  getSessionInfo: jest.fn(() => null),
}));

const {classifyError, inferFailureReason, isEvidenceEnabled, withEvidence} = await import('../../tools/evidence.js');

const ENV_KEY = 'APPIUM_MCP_EVIDENCE';

function enableEvidence(value = '1'): void {
  process.env[ENV_KEY] = value;
}

const textResult = (text: string): ContentResult => ({
  content: [{type: 'text', text}],
});
const errorResult = (text: string): ContentResult => ({
  content: [{type: 'text', text}],
  isError: true,
});

function readRecord(result: ContentResult): ActionEvidenceRecord {
  const block = result.content.find((c) => c.type === 'resource');
  const text = block?.type === 'resource' && 'text' in block.resource ? block.resource.text : undefined;
  if (typeof text !== 'string') {
    throw new Error('no evidence resource block found');
  }
  return JSON.parse(text) as ActionEvidenceRecord;
}

describe('classifyError', () => {
  test.each([
    ['An element could not be located on the page', 'ELEMENT_NOT_FOUND'],
    ['no such element: unable to find', 'ELEMENT_NOT_FOUND'],
    ['stale element reference', 'STALE_ELEMENT'],
    ['The operation timed out after 10000ms', 'TIMEOUT'],
    ['no such context WEBVIEW_x', 'CONTEXT_NOT_AVAILABLE'],
    ['invalid selector: //[', 'INVALID_SELECTOR'],
    ['something unexpected exploded', 'ACTION_FAILED'],
  ])('maps %j -> %s', (message, code) => {
    expect(classifyError(new Error(message))).toBe(code);
  });

  test('accepts non-Error values', () => {
    expect(classifyError('plain timeout string')).toBe('TIMEOUT');
    expect(classifyError(undefined)).toBe('ACTION_FAILED');
  });
});

describe('isEvidenceEnabled', () => {
  const original = process.env[ENV_KEY];
  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
  });

  test.each(['1', 'true', 'TRUE'])('enabled for %j', (value) => {
    process.env[ENV_KEY] = value;
    expect(isEvidenceEnabled()).toBe(true);
  });

  test.each(['0', 'false', '', undefined])('disabled for %j', (value) => {
    if (value === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = value;
    }
    expect(isEvidenceEnabled()).toBe(false);
  });
});

describe('withEvidence', () => {
  const original = process.env[ENV_KEY];
  beforeEach(() => {
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
  });

  test('is a no-op when disabled', () => {
    const result = textResult('ok');
    const out = withEvidence(result, {
      name: 'appium_find_element',
      stage: 'locate',
      startedAt: Date.now(),
    });
    expect(out).toBe(result);
    expect(out.content).toHaveLength(1);
  });

  test('appends a resource block without mutating the text', () => {
    enableEvidence();
    const out = withEvidence(textResult("elementId 'abc'\nfound"), {
      name: 'appium_find_element',
      stage: 'locate',
      startedAt: Date.now(),
      locator: {strategy: 'accessibility id', selector: 'login'},
      element: {webdriverId: 'abc'},
    });

    expect(out.content[0]).toEqual({
      type: 'text',
      text: "elementId 'abc'\nfound",
    });
    const block = out.content[1];
    expect(block.type).toBe('resource');
    if (block.type === 'resource') {
      expect(block.resource.uri).toMatch(/^evidence:\/\//);
      expect(block.resource.mimeType).toBe('application/vnd.appium.evidence+json');
    }
  });

  test('builds a success record', () => {
    enableEvidence();
    const startedAt = Date.now();
    const record = readRecord(
      withEvidence(textResult('found'), {
        name: 'appium_find_element',
        stage: 'locate',
        startedAt,
        locator: {strategy: 'id', selector: 'btn'},
        element: {webdriverId: 'el-1'},
      }),
    );

    expect(record.schemaVersion).toBe(1);
    expect(record.producer.name).toBe('appium-mcp');
    expect(record.evidenceId).toEqual(expect.any(String));
    expect(record.status).toBe('success');
    expect(record.action.name).toBe('appium_find_element');
    expect(record.action.stage).toBe('locate');
    expect(record.action.locator).toEqual({strategy: 'id', selector: 'btn'});
    expect(record.action.element).toEqual({webdriverId: 'el-1'});
    expect(record.error).toBeUndefined();
    expect(record.reason).toBeUndefined();
    expect(record.timing.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.timing.startedAt).toBe(new Date(startedAt).toISOString());
  });

  test('classifies error from the passed error object', () => {
    enableEvidence();
    const record = readRecord(
      withEvidence(errorResult('Failed to find element. Error: stale'), {
        name: 'appium_find_element',
        stage: 'locate',
        startedAt: Date.now(),
        element: {webdriverId: 'el-stale-1'},
        error: new Error('stale element reference'),
      }),
    );

    expect(record.status).toBe('error');
    expect(record.error?.code).toBe('STALE_ELEMENT');
    expect(record.error?.message).toBe('stale element reference');
    expect(record.reason).toEqual({
      hypothesis: expect.stringMatching(/re-rendered|re-locate/i),
      confidence: 0.9,
      signals: [
        'error code is STALE_ELEMENT',
        "element 'el-stale-1' is no longer attached to the current UI hierarchy",
      ],
    });
  });

  test('falls back to result text when no error object is supplied', () => {
    enableEvidence();
    const record = readRecord(
      withEvidence(errorResult('The operation timed out'), {
        name: 'appium_gesture',
        stage: 'interact',
        startedAt: Date.now(),
      }),
    );

    expect(record.status).toBe('error');
    expect(record.error?.code).toBe('TIMEOUT');
    expect(record.error?.message).toBe('The operation timed out');
    expect(record.reason?.confidence).toBe(0.7);
    expect(record.reason?.signals).toContain("timed out during 'interact' stage");
  });
});

describe('inferFailureReason', () => {
  test('flags CSS selector used in NATIVE_APP context', () => {
    const reason = inferFailureReason(
      {code: 'ELEMENT_NOT_FOUND', message: 'no such element'},
      {
        name: 'appium_find_element',
        stage: 'locate',
        locator: {strategy: 'css selector', selector: '.btn'},
        context: {platform: 'android', contextName: 'NATIVE_APP'},
      },
    );

    expect(reason.confidence).toBe(0.85);
    expect(reason.hypothesis).toMatch(/WEBVIEW/);
    expect(reason.signals).toContain("active context is 'NATIVE_APP' while using WebView strategy 'css selector'");
  });

  test('flags native locator strategy used in a WEBVIEW context', () => {
    const reason = inferFailureReason(
      {code: 'ELEMENT_NOT_FOUND', message: 'no such element'},
      {
        name: 'appium_find_element',
        stage: 'locate',
        locator: {strategy: 'accessibility id', selector: 'login_button'},
        context: {platform: 'ios', contextName: 'WEBVIEW_1234'},
      },
    );

    expect(reason.confidence).toBe(0.85);
    expect(reason.hypothesis).toMatch(/NATIVE_APP/);
    expect(reason.signals).toContain(
      "active context is 'WEBVIEW_1234' while using native locator strategy 'accessibility id'",
    );
  });

  test('notes XPath hierarchy sensitivity when XPath fails', () => {
    const reason = inferFailureReason(
      {code: 'ELEMENT_NOT_FOUND', message: 'no such element'},
      {
        name: 'appium_find_element',
        stage: 'locate',
        locator: {strategy: 'xpath', selector: '//XCUIElementTypeButton[1]'},
        context: {platform: 'ios', contextName: 'NATIVE_APP'},
      },
    );

    expect(reason.confidence).toBe(0.65);
    expect(reason.hypothesis).toMatch(/XPath/i);
    expect(reason.signals).toContain('xpath selectors are sensitive to UI hierarchy changes');
  });

  test('flags platform mismatch on INVALID_SELECTOR', () => {
    const reason = inferFailureReason(
      {code: 'INVALID_SELECTOR', message: 'Locator Strategy is not supported'},
      {
        name: 'appium_find_element',
        stage: 'locate',
        locator: {strategy: '-android uiautomator', selector: 'new UiSelector()'},
        context: {platform: 'iOS', contextName: 'NATIVE_APP'},
      },
    );

    expect(reason.confidence).toBe(0.9);
    expect(reason.hypothesis).toMatch(/not supported on platform 'iOS'/);
  });

  test('distinguishes obscured/non-interactable ACTION_FAILED from generic failure', () => {
    const obscured = inferFailureReason(
      {code: 'ACTION_FAILED', message: 'element click intercepted: Element is not clickable'},
      {name: 'appium_gesture', stage: 'interact'},
    );
    expect(obscured.confidence).toBe(0.75);
    expect(obscured.hypothesis).toMatch(/obscured/i);

    const generic = inferFailureReason(
      {code: 'ACTION_FAILED', message: 'unknown server-side error'},
      {name: 'appium_gesture', stage: 'interact'},
    );
    expect(generic.confidence).toBe(0.5);
    expect(generic.signals).toContain("failed during 'interact' stage");
  });
});
