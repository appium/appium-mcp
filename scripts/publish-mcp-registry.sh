#!/usr/bin/env bash
set -euo pipefail

# npm can accept a release before the version is visible to MCP Registry.
# Retry the registry's version-not-found response for up to ten minutes.
max_attempts=21
retry_delay=30

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  echo "Publishing to MCP Registry (attempt ${attempt}/${max_attempts})..."
  if output=$(./mcp-publisher publish 2>&1); then
    printf '%s\n' "$output"
    exit 0
  else
    status=$?
  fi
  printf '%s\n' "$output" >&2

  # Authentication, schema, and other errors need intervention, not retries.
  if ! grep -Eq "NPM package '.*' exists, but version '.*' was not found \(status: 404\)" <<< "$output"; then
    exit "$status"
  fi

  if ((attempt == max_attempts)); then
    echo "npm version is still unavailable to MCP Registry after ${max_attempts} attempts." >&2
    exit "$status"
  fi

  echo "Waiting ${retry_delay}s for npm propagation..."
  sleep "$retry_delay"
done
