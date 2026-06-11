import { afterEach, describe, expect, test } from '@jest/globals';

import {
  isArgumentValueTelemetryEnabled,
  isTelemetryEnabled,
  safeAttributeValue,
  safeInputKeys,
  safeSessionId,
} from '../telemetry/attributes.js';
import {
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
} from '../telemetry/init.js';
import {
  installTelemetryWrappers,
  safeInputValueAttributes,
} from '../telemetry/wrapOperations.js';
import { startOtlpHttpReceiver } from './telemetry-tools/otlp-http-receiver.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
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
      })
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
        capabilities: { platformName: 'iOS', deviceName: 'iPhone 15' },
      })
    ).toEqual({
      'mcp.input.value.capabilities':
        '{"platformName":"iOS","deviceName":"iPhone 15"}',
      'mcp.input.value.platformName': 'iOS',
      'mcp.input.value.strict': true,
      'mcp.input.value.timeout': 1000,
    });
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
      })
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
      })
    );
  });

  test('falls back to string conversion for unserializable attribute values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(safeAttributeValue(circular)).toBe('[object Object]');
  });

  test('truncates long serialized attribute values', () => {
    const value = safeAttributeValue({ text: 'x'.repeat(2100) });

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
      })
    ).toEqual(['platformName', 'sessionId']);
  });

  test('extracts only string session IDs', () => {
    expect(safeSessionId({ sessionId: 'session-1' })).toBe('session-1');
    expect(safeSessionId({ sessionId: 123 })).toBeUndefined();
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
    await expect(server.resourceTemplates[0].load({}, {})).resolves.toBe(
      'resource-template-result'
    );
  });

  test('exports actual OTLP span data for wrapped MCP operations', async () => {
    const receiver = await startOtlpHttpReceiver();

    process.env.APPIUM_MCP_OTEL_ENABLED = 'true';
    process.env.APPIUM_MCP_OTEL_INCLUDE_ARGUMENT_VALUES = 'true';
    process.env.OTEL_SERVICE_NAME = 'appium-mcp-test';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = receiver.endpoint;

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
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      });
      server.addPrompt({
        name: 'plugin_prompt',
        load: async () => ({ messages: [] }),
      });
      server.addResource({
        uri: 'plugin://resource',
        load: async () => ({ contents: [] }),
      });
      server.addResourceTemplate({
        uriTemplate: 'plugin://resource/{id}',
        load: async () => ({ contents: [] }),
      });

      await server.tools[0].execute(
        {
          apiKey: 'secret',
          capabilities: { platformName: 'iOS', deviceName: 'iPhone 15' },
          platformName: 'iOS',
          sessionId: 'session-1',
        },
        {}
      );
      await server.prompts[0].load(
        { password: 'secret', promptArg: 'value' },
        {}
      );
      await server.resources[0].load();
      await server.resourceTemplates[0].load({ id: '123' }, {});

      await shutdownOpenTelemetry();

      const spans = flattenOtlpSpans(
        receiver.requests.map((request) => request.body)
      );
      const spanNames = spans.map((span) => span.name).sort();

      expect(receiver.requests).toHaveLength(1);
      expect(receiver.requests[0].method).toBe('POST');
      expect(receiver.requests[0].url).toBe('/v1/traces');
      expect(receiver.requests[0].headers['content-type']).toContain(
        'application/json'
      );
      expect(spanNames).toEqual([
        'prompts/get plugin_prompt',
        'resources/read',
        'resources/read',
        'tools/call plugin_tool',
      ]);

      const toolSpan = spans.find(
        (span) => span.name === 'tools/call plugin_tool'
      );
      expect(otlpAttributes(toolSpan)).toMatchObject({
        'appium.session.id': 'session-1',
        'mcp.input.value.capabilities':
          '{"platformName":"iOS","deviceName":"iPhone 15"}',
        'mcp.input.value.platformName': 'iOS',
        'mcp.tool.name': 'plugin_tool',
      });
      expect(otlpAttributes(toolSpan)).not.toHaveProperty(
        'mcp.input.value.apiKey'
      );

      const promptSpan = spans.find(
        (span) => span.name === 'prompts/get plugin_prompt'
      );
      expect(otlpAttributes(promptSpan)).toMatchObject({
        'mcp.input.value.promptArg': 'value',
        'mcp.prompt.name': 'plugin_prompt',
      });
      expect(otlpAttributes(promptSpan)).not.toHaveProperty(
        'mcp.input.value.password'
      );

      const resourceAttributes = spans
        .filter((span) => span.name === 'resources/read')
        .map((span) => otlpAttributes(span));
      expect(resourceAttributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'mcp.resource.uri': 'plugin://resource' }),
          expect.objectContaining({
            'mcp.input.value.id': '123',
            'mcp.resource.uri_template': 'plugin://resource/{id}',
          }),
        ])
      );
    } finally {
      await shutdownOpenTelemetry();
      await receiver.close();
    }
  });
});

function flattenOtlpSpans(bodies: unknown[]): any[] {
  return bodies.flatMap((body: any) =>
    (body?.resourceSpans ?? []).flatMap((resourceSpan: any) =>
      (resourceSpan.scopeSpans ?? []).flatMap(
        (scopeSpan: any) => scopeSpan.spans ?? []
      )
    )
  );
}

function otlpAttributes(span: any): Record<string, unknown> {
  return Object.fromEntries(
    (span?.attributes ?? []).map((attribute: any) => [
      attribute.key,
      otlpValue(attribute.value),
    ])
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
