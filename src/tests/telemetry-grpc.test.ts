import {createServer, type IncomingHttpHeaders, type ServerHttp2Session, type ServerHttp2Stream} from 'node:http2';

import {expect, test} from '@jest/globals';
import {trace} from '@opentelemetry/api';

import {initializeOpenTelemetry, shutdownOpenTelemetry} from '../telemetry/init.js';

test('exports a span over OTLP/gRPC using endpoint and metadata environment variables', async () => {
  const originalEnv = {...process.env};
  const requests: Array<{headers: IncomingHttpHeaders; body: Buffer}> = [];
  const sessions = new Set<ServerHttp2Session>();
  const server = createServer();
  server.on('session', (session) => {
    sessions.add(session);
    session.on('close', () => sessions.delete(session));
  });
  server.on('stream', (stream: ServerHttp2Stream, headers) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      requests.push({headers, body: Buffer.concat(chunks)});
      stream.respond({':status': 200, 'content-type': 'application/grpc'}, {waitForTrailers: true});
      stream.on('wantTrailers', () => stream.sendTrailers({'grpc-status': '0'}));
      // An empty ExportTraceServiceResponse inside a gRPC message frame.
      stream.end(Buffer.alloc(5));
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing receiver address');
    }
    // Isolate this integration test from the developer's telemetry configuration.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('OTEL_')) {
        delete process.env[key];
      }
    }
    process.env.APPIUM_MCP_OTEL_ENABLED = 'true';
    process.env.OTEL_LOGS_EXPORTER = 'none';
    process.env.OTEL_METRICS_EXPORTER = 'none';
    process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL = 'grpc';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${address.port}`;
    process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS = 'x-test-token=grpc-test';
    process.env.OTEL_SERVICE_NAME = 'appium-mcp-grpc-test';

    await initializeOpenTelemetry();
    await initializeOpenTelemetry(); // Initialization must remain idempotent.
    trace.getTracer('grpc-test').startSpan('grpc-export-probe').end();
    await shutdownOpenTelemetry();

    expect(requests).toHaveLength(1);
    const {headers, body} = requests[0];
    expect(headers[':path']).toBe('/opentelemetry.proto.collector.trace.v1.TraceService/Export');
    expect(headers['content-type']).toContain('application/grpc');
    expect(headers['x-test-token']).toBe('grpc-test');
    expect(body[0]).toBe(0); // Uncompressed protobuf frame.
    expect(body.readUInt32BE(1)).toBe(body.length - 5);
    expect(body.includes(Buffer.from('grpc-export-probe'))).toBe(true);
    expect(body.includes(Buffer.from('appium-mcp-grpc-test'))).toBe(true);
  } finally {
    await shutdownOpenTelemetry();
    for (const session of sessions) {
      session.destroy();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env = originalEnv;
  }
});
