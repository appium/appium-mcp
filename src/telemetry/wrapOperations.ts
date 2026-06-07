import type { FastMCP } from 'fastmcp';

import { safeInputKeys, safeSessionId } from './attributes.js';
import { getActiveSpan, SpanStatusCode, withSpan } from './tracer.js';

type ToolDef = Parameters<FastMCP['addTool']>[0];
type PromptDef = Parameters<FastMCP['addPrompt']>[0];
type ResourceDef = Parameters<FastMCP['addResource']>[0];
type ResourceTemplateDef = Parameters<FastMCP['addResourceTemplate']>[0];

type ToolExecute = NonNullable<ToolDef['execute']>;
type PromptLoad = NonNullable<PromptDef['load']>;
type ResourceLoad = NonNullable<ResourceDef['load']>;
type ResourceTemplateLoad = NonNullable<ResourceTemplateDef['load']>;

export function installTelemetryWrappers(server: FastMCP): void {
  const originalAddTool = server.addTool.bind(server) as FastMCP['addTool'];

  server.addTool = ((toolDef: ToolDef) =>
    originalAddTool(wrapToolWithTelemetry(toolDef))) as FastMCP['addTool'];

  if (typeof server.addPrompt === 'function') {
    const originalAddPrompt = server.addPrompt.bind(
      server
    ) as FastMCP['addPrompt'];
    server.addPrompt = ((promptDef: PromptDef) =>
      originalAddPrompt(
        wrapPromptWithTelemetry(promptDef)
      )) as FastMCP['addPrompt'];
  }

  if (typeof server.addResource === 'function') {
    const originalAddResource = server.addResource.bind(
      server
    ) as FastMCP['addResource'];
    server.addResource = ((resourceDef: ResourceDef) =>
      originalAddResource(
        wrapResourceWithTelemetry(resourceDef)
      )) as FastMCP['addResource'];
  }

  if (typeof server.addResourceTemplate === 'function') {
    const originalAddResourceTemplate = server.addResourceTemplate.bind(
      server
    ) as FastMCP['addResourceTemplate'];
    server.addResourceTemplate = ((resourceTemplateDef: ResourceTemplateDef) =>
      originalAddResourceTemplate(
        wrapResourceTemplateWithTelemetry(resourceTemplateDef)
      )) as FastMCP['addResourceTemplate'];
  }
}

export function wrapToolWithTelemetry(toolDef: ToolDef): ToolDef {
  const execute = toolDef.execute as ToolExecute | undefined;
  if (!execute) {
    return toolDef;
  }

  const toolName = toolDef.name ?? 'unknown_tool';

  return {
    ...toolDef,
    execute: async (args, context) =>
      withSpan(
        `tools/call ${toolName}`,
        toolAttributes(toolName, args),
        async () => {
          const result = await execute(args, context);
          if (isErrorResult(result)) {
            getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR });
            getActiveSpan()?.setAttribute('mcp.tool.result.is_error', true);
          }
          return result;
        }
      ),
  };
}

function wrapPromptWithTelemetry(promptDef: PromptDef): PromptDef {
  const load = promptDef.load as PromptLoad | undefined;
  if (!load) {
    return promptDef;
  }

  const promptName = promptDef.name ?? 'unknown_prompt';

  return {
    ...promptDef,
    load: async (args, auth) =>
      withSpan(
        `prompts/get ${promptName}`,
        {
          'mcp.prompt.name': promptName,
          ...inputKeyAttributes(args),
        },
        () => load(args, auth)
      ),
  };
}

function wrapResourceWithTelemetry(resourceDef: ResourceDef): ResourceDef {
  const load = resourceDef.load as ResourceLoad | undefined;
  if (!load) {
    return resourceDef;
  }

  const uri = resourceDef.uri ?? 'unknown_resource';

  return {
    ...resourceDef,
    load: async () =>
      withSpan(
        'resources/read',
        {
          'mcp.resource.uri': uri,
        },
        () => load()
      ),
  };
}

function wrapResourceTemplateWithTelemetry(
  resourceTemplateDef: ResourceTemplateDef
): ResourceTemplateDef {
  const load = resourceTemplateDef.load as ResourceTemplateLoad | undefined;
  if (!load) {
    return resourceTemplateDef;
  }

  const uriTemplate =
    resourceTemplateDef.uriTemplate?.toString() ?? 'unknown_resource_template';

  return {
    ...resourceTemplateDef,
    load: async (args, auth) =>
      withSpan(
        'resources/read',
        {
          'mcp.resource.uri_template': uriTemplate,
          ...inputKeyAttributes(args),
        },
        () => load(args, auth)
      ),
  };
}

function toolAttributes(toolName: string, args: unknown) {
  const attributes: Record<string, string | string[]> = {
    'mcp.tool.name': toolName,
  };

  const sessionId = safeSessionId(args);
  if (sessionId) {
    attributes['appium.session.id'] = sessionId;
  }

  return {
    ...attributes,
    ...inputKeyAttributes(args),
  };
}

function inputKeyAttributes(args: unknown): Record<string, string[]> {
  const inputKeys = safeInputKeys(args);
  return inputKeys.length > 0 ? { 'mcp.input.keys': inputKeys } : {};
}

function isErrorResult(result: unknown): boolean {
  return (
    !!result &&
    typeof result === 'object' &&
    'isError' in result &&
    (result as { isError?: unknown }).isError === true
  );
}
