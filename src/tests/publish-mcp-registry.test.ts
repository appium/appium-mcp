import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterEach, beforeEach, describe, expect, test} from '@jest/globals';

const scriptPath = fileURLToPath(new URL('../../scripts/publish-mcp-registry.sh', import.meta.url));
const propagationError =
  'Error: publish failed: server returned status 400: {"errors":[{"message":"registry validation failed for package 0 (appium-mcp): NPM package \'appium-mcp\' exists, but version \'1.95.8\' was not found (status: 404). A newly published release can take a moment to appear on the registry. Wait and retry, or publish version \'1.95.8\' before registering it"}]}';

describe('MCP Registry publication', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'publish-mcp-registry-'));
    writeFileSync(path.join(cwd, 'attempts'), '0\n');
    writeFileSync(path.join(cwd, 'sleeps'), '');
    writeFileSync(
      path.join(cwd, 'mcp-publisher'),
      `#!/usr/bin/env bash
set -eu
[[ "$*" == "publish" ]]
attempt=$(cat attempts)
attempt=$((attempt + 1))
echo "$attempt" > attempts
if ((attempt <= FAILURES)); then
  printf '%s\\n' "$FAILURE_MESSAGE" >&2
  exit 7
fi
echo 'Successfully published'
`,
      {mode: 0o755},
    );
    writeFileSync(path.join(cwd, 'sleep'), '#!/usr/bin/env bash\necho "$1" >> sleeps\n', {
      mode: 0o755,
    });
  });

  afterEach(() => {
    rmSync(cwd, {recursive: true, force: true});
  });

  function publish(failures: number, message = propagationError) {
    return spawnSync('bash', [scriptPath], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${cwd}${path.delimiter}${process.env.PATH}`,
        FAILURES: String(failures),
        FAILURE_MESSAGE: message,
      },
    });
  }

  test('publishes immediately when npm has propagated', () => {
    const result = publish(0);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Successfully published');
    expect(readFileSync(path.join(cwd, 'attempts'), 'utf8')).toBe('1\n');
    expect(readFileSync(path.join(cwd, 'sleeps'), 'utf8')).toBe('');
  });

  test('retries propagation failures until publication succeeds', () => {
    const result = publish(2);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(propagationError);
    expect(result.stdout).toContain('Successfully published');
    expect(readFileSync(path.join(cwd, 'attempts'), 'utf8')).toBe('3\n');
    expect(readFileSync(path.join(cwd, 'sleeps'), 'utf8')).toBe('30\n30\n');
  });

  test('fails after the retry budget is exhausted', () => {
    const result = publish(100);
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('still unavailable to MCP Registry after 21 attempts');
    expect(readFileSync(path.join(cwd, 'attempts'), 'utf8')).toBe('21\n');
    expect(readFileSync(path.join(cwd, 'sleeps'), 'utf8')).toBe('30\n'.repeat(20));
  });

  test.each([
    'Error: unauthorized (status: 401)',
    'Error: publish failed: server returned status 400: invalid server schema',
    'Error: publish failed: server returned status 404: server not found',
  ])('does not retry unrelated failures: %s', (message) => {
    const result = publish(1, message);
    expect(result.status).toBe(7);
    expect(result.stderr).toContain(message);
    expect(readFileSync(path.join(cwd, 'attempts'), 'utf8')).toBe('1\n');
    expect(readFileSync(path.join(cwd, 'sleeps'), 'utf8')).toBe('');
  });
});
