/**
 * Shared tracer helpers for appium-mcp instrumentation. Tool, prompt, and
 * resource wrappers use this module so span creation, exception recording, and
 * disabled-telemetry behavior stay consistent across MCP operation types.
 */

import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
} from '@opentelemetry/api';

import { isTelemetryEnabled } from './attributes.js';

const TRACER_NAME = 'appium-mcp';

/**
 * Gets the OpenTelemetry tracer for appium-mcp. This is used by tool, prompt,
 * and resource wrappers to create spans with a consistent name and configuration.
 * @returns The OpenTelemetry tracer for appium-mcp.
 */
export function getAppiumMcpTracer() {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Gets the currently active OpenTelemetry span from the context. This is used by
 * tool, prompt, and resource wrappers to add attributes or record exceptions on the
 * active span without needing to pass the span object through multiple layers of calls.
 * @returns The currently active OpenTelemetry span, or undefined if there is no active span.
 */
export function getActiveSpan() {
  return trace.getActiveSpan();
}

/**
 * Runs the given asynchronous operation within a new OpenTelemetry span with the specified name and attributes.
 * If telemetry is not enabled, the operation is run without creating a span.
 * If the operation throws an error, the error is recorded on the span and re-thrown.
 * @param name The name of the span.
 * @param attributes The attributes to set on the span.
 * @param operation The asynchronous operation to run within the span.
 * @returns The result of the asynchronous operation.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>
): Promise<T> {
  if (!isTelemetryEnabled()) {
    return operation();
  }

  const span = getAppiumMcpTracer().startSpan(name, {
    attributes,
    kind: SpanKind.INTERNAL,
  });

  try {
    return await context.with(trace.setSpan(context.active(), span), operation);
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    span.end();
  }
}

export { SpanStatusCode };
