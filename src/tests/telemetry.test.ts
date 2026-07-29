import {afterEach, describe, expect, test} from '@jest/globals';

import {
  isArgumentValueTelemetryEnabled,
  isTelemetryEnabled,
  safeAttributeValue,
  safeInputKeys,
  safeSessionId,
} from '../telemetry/attributes.js';
import {initializeOpenTelemetry, shutdownOpenTelemetry} from '../telemetry/init.js';
import {
  installTelemetryWrappers,
  safeInputValueAttributes,
  safeToolResultSizeAttributes,
} from '../telemetry/wrapOperations.js';
import {startOtlpHttpReceiver} from './telemetry-tools/otlp-http-receiver.js';

const originalEnv = {...process.env};

afterEach(() => {
  process.env = {...originalEnv};
});

describe('telemetry attributes', () => {
  test('is disabled by default', () => {
    delete process.env.APPIUM_MCP_OTEL_ENABLED;

    expect(isTelemetryEnabled()).toBe(false);
  });

  test('accepts explicit truthy opt-in values', () => {
    process.env.APPIUM_MCP_OTEL_ENABLED = 'true';

    expect(isTelemetryEnabled()).toBe(true);
  });

  test('accepts shared truthy environment values', () => {
    for (const value of ['1', 'true', 'yes', 'on']) {
      process.env.APPIUM_MCP_OTEL_ENABLED = value;
      expect(isTelemetryEnabled()).toBe(true);
    }
  });

  test('keeps argument values disabled by default', () => {
    delete process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES;
    expect(isArgumentValueTelemetryEnabled()).toBe(false);
    expect(
      safeInputValueAttributes({
        platformName: 'iOS',
      }),
    ).toEqual({});
  });

  test('includes non-sensitive argument values only when explicitly enabled', () => {
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';

    expect(
      safeInputValueAttributes({
        apiKey: 'secret',
        password: 'secret',
        platformName: 'iOS',
        strict: true,
        timeout: 1000,
        capabilities: {platformName: 'iOS', deviceName: 'iPhone 15'},
      }),
    ).toEqual({
      'mcp.input.value.capabilities': '{"platformName":"iOS","deviceName":"iPhone 15"}',
      'mcp.input.value.platformName': 'iOS',
      'mcp.input.value.strict': true,
      'mcp.input.value.timeout': 1000,
    });
  });

  test('ignores non-object input values when argument value telemetry is enabled', () => {
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';

    expect(safeInputValueAttributes(null)).toEqual({});
    expect(safeInputValueAttributes(undefined)).toEqual({});
    expect(safeInputValueAttributes('platformName')).toEqual({});
    expect(safeInputValueAttributes(['platformName'])).toEqual({});
  });

  test('redacts nested sensitive values in safe input value attributes', () => {
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';

    expect(
      safeInputValueAttributes({
        capabilities: {
          platformName: 'iOS',
          password: 'secret',
          nested: {
            appiumApiKey: 'also-secret',
          },
        },
      }),
    ).toEqual({
      'mcp.input.value.capabilities':
        '{"platformName":"iOS","password":"[REDACTED]","nested":{"appiumApiKey":"[REDACTED]"}}',
    });
  });

  test('uses string fallback for circular safe input value attributes', () => {
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(safeInputValueAttributes({metadata: circular})).toEqual({
      'mcp.input.value.metadata': '[object Object]',
    });
  });

  test('truncates long safe input value attributes', () => {
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';

    const attributes = safeInputValueAttributes({
      metadata: {text: 'x'.repeat(2100)},
    });
    const value = attributes['mcp.input.value.metadata'];

    expect(typeof value).toBe('string');
    expect(value).toHaveLength(2051);
    expect(String(value).endsWith('...')).toBe(true);
  });

  test('keeps primitive attribute values unchanged and normalizes nullish values', () => {
    expect(safeAttributeValue('iOS')).toBe('iOS');
    expect(safeAttributeValue(2)).toBe(2);
    expect(safeAttributeValue(false)).toBe(false);
    expect(safeAttributeValue(null)).toBe('');
    expect(safeAttributeValue(undefined)).toBe('');
  });

  test('serializes object attribute values and redacts nested sensitive keys', () => {
    expect(
      safeAttributeValue({
        capabilities: {
          platformName: 'iOS',
          appiumApiKey: 'secret',
        },
        nested: [
          {
            password: 'also-secret',
          },
        ],
      }),
    ).toBe(
      JSON.stringify({
        capabilities: {
          platformName: 'iOS',
          appiumApiKey: '[REDACTED]',
        },
        nested: [
          {
            password: '[REDACTED]',
          },
        ],
      }),
    );
  });

  test('falls back to string conversion for unserializable attribute values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(safeAttributeValue(circular)).toBe('[object Object]');
  });

  test('truncates long serialized attribute values', () => {
    const value = safeAttributeValue({text: 'x'.repeat(2100)});

    expect(typeof value).toBe('string');
    expect(value).toHaveLength(2051);
    expect(String(value).endsWith('...')).toBe(true);
  });

  test('keeps sensitive argument names out of telemetry attributes', () => {
    expect(
      safeInputKeys({
        apiKey: 'secret',
        password: 'secret',
        platformName: 'iOS',
        remoteServerUrl: 'https://user:pass@example.test/wd/hub',
        sessionId: 'session-1',
      }),
    ).toEqual(['platformName', 'sessionId']);
  });

  test('counts tool result sizes without exposing payload contents', () => {
    const secretText = 'private page source';
    const secretHtml = '<html>private screenshot</html>';
    const attributes = safeToolResultSizeAttributes({
      content: [
        {type: 'text', text: secretText},
        {type: 'resource', resource: {text: secretHtml}},
        {type: 'resource', resource: {blob: 'YWJj'}},
        {type: 'image', data: 'c2VjcmV0'},
        {type: 'audio', data: 'YQ=='},
        {type: 'resource_link', uri: 'private://resource'},
        {type: 'private payload type', value: 'must not be recorded'},
      ],
    });

    expect(attributes).toEqual({
      'mcp.tool.result.audio_count': 1,
      'mcp.tool.result.base64_bytes_estimate': 10,
      'mcp.tool.result.base64_chars': 16,
      'mcp.tool.result.content_count': 7,
      'mcp.tool.result.content_types': ['audio', 'image', 'other', 'resource', 'resource_link', 'text'],
      'mcp.tool.result.image_count': 1,
      'mcp.tool.result.resource_count': 2,
      'mcp.tool.result.resource_text_chars': secretHtml.length,
      'mcp.tool.result.text_chars': secretText.length,
    });

    const attributeValues = Object.values(attributes).flat().join(' ');
    expect(attributeValues).not.toContain(secretText);
    expect(attributeValues).not.toContain(secretHtml);
    expect(attributeValues).not.toContain('private payload type');
    expect(attributeValues).not.toContain('must not be recorded');
    expect(attributeValues).not.toContain('YWJj');
    expect(attributeValues).not.toContain('c2VjcmV0');
  });

  test('measures string tool results and ignores unrelated result shapes', () => {
    expect(safeToolResultSizeAttributes('tool-result')).toEqual({
      'mcp.tool.result.text_chars': 11,
    });
    expect(safeToolResultSizeAttributes(undefined)).toEqual({});
    expect(safeToolResultSizeAttributes({messages: []})).toEqual({});

    const circular: Record<string, unknown> = {content: [{type: 'text', text: 'ok'}]};
    circular.self = circular;
    expect(safeToolResultSizeAttributes(circular)).toMatchObject({
      'mcp.tool.result.content_count': 1,
      'mcp.tool.result.text_chars': 2,
    });
  });

  test('extracts only string session IDs', () => {
    expect(safeSessionId({sessionId: 'session-1'})).toBe('session-1');
    expect(safeSessionId({sessionId: 123})).toBeUndefined();
  });

  test('wraps tools, prompts, resources, and resource templates without changing results', async () => {
    const server = {
      tools: [] as any[],
      prompts: [] as any[],
      resources: [] as any[],
      resourceTemplates: [] as any[],
      addTool(toolDef: any) {
        this.tools.push(toolDef);
      },
      addPrompt(promptDef: any) {
        this.prompts.push(promptDef);
      },
      addResource(resourceDef: any) {
        this.resources.push(resourceDef);
      },
      addResourceTemplate(resourceTemplateDef: any) {
        this.resourceTemplates.push(resourceTemplateDef);
      },
    };

    installTelemetryWrappers(server as any);

    server.addTool({
      name: 'plugin_tool',
      execute: async () => 'tool-result',
    });
    server.addPrompt({
      name: 'plugin_prompt',
      load: async () => 'prompt-result',
    });
    server.addResource({
      uri: 'plugin://resource',
      load: async () => 'resource-result',
    });
    server.addResourceTemplate({
      uriTemplate: 'plugin://resource/{id}',
      load: async () => 'resource-template-result',
    });

    await expect(server.tools[0].execute({}, {})).resolves.toBe('tool-result');
    await expect(server.prompts[0].load({}, {})).resolves.toBe('prompt-result');
    await expect(server.resources[0].load()).resolves.toBe('resource-result');
    await expect(server.resourceTemplates[0].load({}, {})).resolves.toBe('resource-template-result');
  });

  test('exports actual OTLP span data for wrapped MCP operations', async () => {
    const receiver = await startOtlpHttpReceiver();
    const privateToolText = 'private tool output';
    const privateResourceText = '<html>private resource</html>';
    const privateImageData = 'c2VjcmV0';

    process.env.APPIUM_MCP_OTEL_ENABLED = 'true';
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';
    process.env.OTEL_SERVICE_NAME = 'appium-mcp-test';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = receiver.endpoint;
    process.env.OTEL_RESOURCE_ATTRIBUTES = 'testcase.id=my-test-123,team=platform';

    const server = {
      tools: [] as any[],
      prompts: [] as any[],
      resources: [] as any[],
      resourceTemplates: [] as any[],
      addTool(toolDef: any) {
        this.tools.push(toolDef);
      },
      addPrompt(promptDef: any) {
        this.prompts.push(promptDef);
      },
      addResource(resourceDef: any) {
        this.resources.push(resourceDef);
      },
      addResourceTemplate(resourceTemplateDef: any) {
        this.resourceTemplates.push(resourceTemplateDef);
      },
    };

    try {
      await initializeOpenTelemetry();
      installTelemetryWrappers(server as any);

      server.addTool({
        name: 'plugin_tool',
        execute: async () => ({
          content: [
            {type: 'text', text: privateToolText},
            {type: 'resource', resource: {text: privateResourceText}},
            {type: 'image', data: privateImageData},
          ],
        }),
      });
      server.addPrompt({
        name: 'plugin_prompt',
        load: async () => ({messages: []}),
      });
      server.addResource({
        uri: 'plugin://resource',
        load: async () => ({contents: []}),
      });
      server.addResourceTemplate({
        uriTemplate: 'plugin://resource/{id}',
        load: async () => ({contents: []}),
      });

      await server.tools[0].execute(
        {
          apiKey: 'secret',
          capabilities: {platformName: 'iOS', deviceName: 'iPhone 15'},
          platformName: 'iOS',
          sessionId: 'session-1',
        },
        {},
      );
      await server.prompts[0].load({password: 'secret', promptArg: 'value'}, {});
      await server.resources[0].load();
      await server.resourceTemplates[0].load({id: '123'}, {});

      await shutdownOpenTelemetry();

      const spans = flattenOtlpSpans(receiver.requests.map((request) => request.body));
      const spanNames = spans.map((span) => span.name).sort();

      expect(receiver.requests).toHaveLength(1);
      expect(receiver.requests[0].method).toBe('POST');
      expect(receiver.requests[0].url).toBe('/v1/traces');
      expect(receiver.requests[0].headers['content-type']).toContain('application/json');
      expect(spanNames).toEqual([
        'prompts/get plugin_prompt',
        'resources/read',
        'resources/read',
        'tools/call plugin_tool',
      ]);

      const toolSpan = spans.find((span) => span.name === 'tools/call plugin_tool');
      expect(otlpAttributes(toolSpan)).toMatchObject({
        'appium.session.id': 'session-1',
        'mcp.input.value.capabilities': '{"platformName":"iOS","deviceName":"iPhone 15"}',
        'mcp.input.value.platformName': 'iOS',
        'mcp.tool.name': 'plugin_tool',
        'mcp.tool.result.base64_bytes_estimate': 6,
        'mcp.tool.result.base64_chars': 8,
        'mcp.tool.result.content_count': 3,
        'mcp.tool.result.content_types': ['image', 'resource', 'text'],
        'mcp.tool.result.image_count': 1,
        'mcp.tool.result.resource_count': 1,
        'mcp.tool.result.resource_text_chars': privateResourceText.length,
        'mcp.tool.result.text_chars': privateToolText.length,
      });
      expect(otlpAttributes(toolSpan)).not.toHaveProperty('mcp.input.value.apiKey');
      const exportedTelemetry = JSON.stringify(receiver.requests[0].body);
      expect(exportedTelemetry).not.toContain(privateToolText);
      expect(exportedTelemetry).not.toContain(privateResourceText);
      expect(exportedTelemetry).not.toContain(privateImageData);

      const promptSpan = spans.find((span) => span.name === 'prompts/get plugin_prompt');
      expect(otlpAttributes(promptSpan)).toMatchObject({
        'mcp.input.value.promptArg': 'value',
        'mcp.prompt.name': 'plugin_prompt',
      });
      expect(otlpAttributes(promptSpan)).not.toHaveProperty('mcp.input.value.password');

      const resourceAttributes = spans
        .filter((span) => span.name === 'resources/read')
        .map((span) => otlpAttributes(span));
      expect(resourceAttributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({'mcp.resource.uri': 'plugin://resource'}),
          expect.objectContaining({
            'mcp.input.value.id': '123',
            'mcp.resource.uri_template': 'plugin://resource/{id}',
          }),
        ]),
      );

      const resourceSpanAttrs = flattenOtlpResourceAttributes(receiver.requests[0].body);
      expect(resourceSpanAttrs).toMatchObject({
        'testcase.id': 'my-test-123',
        team: 'platform',
      });
    } finally {
      await shutdownOpenTelemetry();
      await receiver.close();
    }
  });
});

function flattenOtlpResourceAttributes(body: unknown): Record<string, unknown> {
  const resourceSpan = (body as any)?.resourceSpans?.[0];
  return Object.fromEntries(
    (resourceSpan?.resource?.attributes ?? []).map((attr: any) => [attr.key, otlpValue(attr.value)]),
  );
}

function flattenOtlpSpans(bodies: unknown[]): any[] {
  return bodies.flatMap((body: any) =>
    (body?.resourceSpans ?? []).flatMap((resourceSpan: any) =>
      (resourceSpan.scopeSpans ?? []).flatMap((scopeSpan: any) => scopeSpan.spans ?? []),
    ),
  );
}

function otlpAttributes(span: any): Record<string, unknown> {
  return Object.fromEntries(
    (span?.attributes ?? []).map((attribute: any) => [attribute.key, otlpValue(attribute.value)]),
  );
}

function otlpValue(value: any): unknown {
  if ('stringValue' in value) {
    return value.stringValue;
  }
  if ('intValue' in value) {
    return value.intValue;
  }
  if ('doubleValue' in value) {
    return value.doubleValue;
  }
  if ('boolValue' in value) {
    return value.boolValue;
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(otlpValue);
  }
  return value;
}
