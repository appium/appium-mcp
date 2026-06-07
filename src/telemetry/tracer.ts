import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
} from '@opentelemetry/api';

import { isTelemetryEnabled } from './attributes.js';

const TRACER_NAME = 'appium-mcp';

export function getAppiumMcpTracer() {
  return trace.getTracer(TRACER_NAME);
}

export function getActiveSpan() {
  return trace.getActiveSpan();
}

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
