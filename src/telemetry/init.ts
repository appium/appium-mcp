/**
 * OpenTelemetry SDK bootstrap for the appium-mcp CLI. Initialization is opt-in
 * via APPIUM_MCP_OTEL_ENABLED so normal server startup keeps the default no-op
 * OpenTelemetry provider and avoids exporter setup unless tracing is requested.
 */

import log from '../logger.js';
import { isTelemetryEnabled } from './attributes.js';

let sdkStarted = false;
let shutdownRegistered = false;
let sdk: { start(): void; shutdown(): Promise<void> } | undefined;

/**
 * Initializes the OpenTelemetry SDK if telemetry is enabled and not already started.
 * This function is idempotent and safe to call multiple times; the SDK will only
 * be initialized once.
 * @returns
 */
export async function initializeOpenTelemetry(): Promise<void> {
  if (!isTelemetryEnabled() || sdkStarted) {
    return;
  }

  const [{ NodeSDK }, { OTLPTraceExporter }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
  ]);

  const nodeSdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
  });

  sdk = nodeSdk;
  nodeSdk.start();
  sdkStarted = true;
  registerShutdown();
  log.info('OpenTelemetry tracing enabled for appium-mcp.');
}

/**
 * Shuts down the OpenTelemetry SDK if it was started. This is typically called during process shutdown to ensure
 * that all telemetry data is flushed properly. This function is idempotent and safe to call multiple times.
 * @returns
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdkStarted || !sdk) {
    return;
  }

  try {
    await sdk.shutdown();
  } finally {
    sdk = undefined;
    sdkStarted = false;
  }
}

function registerShutdown(): void {
  if (shutdownRegistered) {
    return;
  }

  shutdownRegistered = true;

  const shutdown = async () => {
    try {
      await shutdownOpenTelemetry();
    } catch (error) {
      log.error('Error shutting down OpenTelemetry SDK:', error);
    }
  };

  process.once('beforeExit', () => {
    void shutdown();
  });
}
