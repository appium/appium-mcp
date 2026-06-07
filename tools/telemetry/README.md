# Local Jaeger

This directory contains a local Jaeger setup for inspecting appium-mcp OpenTelemetry spans.

## Start Jaeger

```bash
npm run telemetry:jaeger:start
```

The npm scripts use `tools/telemetry/jaeger.sh`, which supports both Docker Compose v2 (`docker compose`) and legacy `docker-compose`.

Open the Jaeger UI:

```text
http://127.0.0.1:16686
```

## Run appium-mcp With Tracing

Build first if you want to run `dist/index.js`:

```bash
npm run build
```

Then start appium-mcp with the Jaeger OTLP endpoint:

```bash
npm run telemetry:appium:start:httpStream
```

Or set the environment variables manually:

```bash
APPIUM_MCP_OTEL_ENABLED=true \
OTEL_SERVICE_NAME=appium-mcp-local \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces \
OTEL_TRACES_SAMPLER=parentbased_always_on \
npm run start:httpStream
```

The same values are available in `tools/telemetry/jaeger.env` for MCP clients or shells that load env files.

## Stop Jaeger

```bash
npm run telemetry:jaeger:stop
```

## Ports

| Port | Use |
| --- | --- |
| `16686` | Jaeger UI |
| `4317` | OTLP gRPC |
| `4318` | OTLP HTTP |

appium-mcp currently exports traces over OTLP HTTP to `http://127.0.0.1:4318/v1/traces`.
