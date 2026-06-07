#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/jaeger-compose.yml"
COMMAND="${1:-}"

if [ -z "$COMMAND" ]; then
  echo "Usage: $0 start|stop|logs|config" >&2
  exit 2
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose was not found. Install Docker Compose v2 or docker-compose." >&2
  exit 127
fi

case "$COMMAND" in
  start)
    $COMPOSE -f "$COMPOSE_FILE" up -d
    ;;
  stop)
    $COMPOSE -f "$COMPOSE_FILE" down
    ;;
  logs)
    $COMPOSE -f "$COMPOSE_FILE" logs -f
    ;;
  config)
    $COMPOSE -f "$COMPOSE_FILE" config
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    echo "Usage: $0 start|stop|logs|config" >&2
    exit 2
    ;;
esac
