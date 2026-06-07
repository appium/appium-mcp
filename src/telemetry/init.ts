import log from '../logger.js';
import { isTelemetryEnabled } from './attributes.js';

let sdkStarted = false;
let shutdownRegistered = false;
let sdk: { start(): void; shutdown(): Promise<void> } | undefined;

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

function registerShutdown(): void {
  if (shutdownRegistered) {
    return;
  }

  shutdownRegistered = true;

  const shutdown = async () => {
    if (!sdkStarted || !sdk) {
      return;
    }

    try {
      await sdk.shutdown();
    } catch (error) {
      log.error('Error shutting down OpenTelemetry SDK:', error);
    }
  };

  process.once('beforeExit', () => {
    void shutdown();
  });
}
