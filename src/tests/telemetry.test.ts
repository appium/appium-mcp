import { afterEach, describe, expect, test } from '@jest/globals';

import {
  isTelemetryEnabled,
  safeInputKeys,
  safeSessionId,
} from '../telemetry/attributes.js';
import { installTelemetryWrappers } from '../telemetry/wrapOperations.js';

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
});
