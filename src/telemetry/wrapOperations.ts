/**
 * FastMCP operation wrappers that create spans around registered MCP handlers.
 * Installing these wrappers before built-in and plugin registration covers
 * tools, prompts, resources, and resource templates without changing handler
 * return values or recording sensitive request/response payloads.
 */

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

/**
 * Installs telemetry wrappers on the given FastMCP server instance. This should be
 * called early in the server setup process, before registering any tools, prompts,
 * or resources, to ensure that all operations are wrapped with OpenTelemetry spans.
 * Each span will be named according to the operation type and include attributes
 * such as tool name, prompt name, resource URI, session ID, and input keys, while
 * avoiding any sensitive information.
 * @param server The FastMCP server instance on which to install telemetry wrappers.
 */
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

/**
 * Wraps a tool definition with telemetry spans around its execute function.
 * The span will be named "tools/call {toolName}" and include attributes for the tool name,
 * session ID (if available), and input keys. If the tool execution results in an error,
 * the span status will be set to error and an attribute will indicate that the result is an error.
 * @param toolDef The original tool definition to wrap.
 * @returns A new tool definition with telemetry spans around the execute function.
 */
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

/**
 * Wraps a prompt definition with telemetry spans around its load function.
 * The span will be named "prompts/get {promptName}" and include attributes for the prompt name
 * and input keys. If the prompt load results in an error, the span status will be set to error
 * and an attribute will indicate that the result is an error.
 * @param promptDef The original prompt definition to wrap.
 * @returns A new prompt definition with telemetry spans around the load function.
 */
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
