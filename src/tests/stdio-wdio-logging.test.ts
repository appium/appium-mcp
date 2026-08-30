import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, test} from '@jest/globals';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(rootDir, 'dist/tests/fixtures/programmatic-stdio-wdio-child.js');

function isJsonRpcLine(line: string): boolean {
  if (!line.trim()) {
    return true;
  }
  try {
    const message = JSON.parse(line);
    return typeof message === 'object' && message !== null && 'jsonrpc' in message;
  } catch {
    return false;
  }
}

describe('programmatic stdio WDIO logging', () => {
  test('keeps non-JSON-RPC output off stdout after core stdio start', async () => {
    if (!existsSync(fixturePath)) {
      throw new Error(`Compiled fixture missing at ${fixturePath}. Run npm run build first.`);
    }

    const env = {
      ...process.env,
      WDIO_LOG_LEVEL: 'info',
    };
    const child = spawn(process.execPath, [fixturePath], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`child process timed out\nstdout: ${stdout}\nstderr: ${stderr}`));
      }, 15_000);

      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code ?? 1);
      });
    });

    expect(exitCode).toBe(0);
    expect(stderr).toContain('child-done');

    const nonEmptyStdoutLines = stdout.split('\n').filter((line) => line.trim().length > 0);
    for (const line of nonEmptyStdoutLines) {
      expect(isJsonRpcLine(line)).toBe(true);
    }

    expect(stdout).not.toMatch(/INFO\s+@wdio\/utils:/);
    expect(stdout).not.toMatch(/INFO\s+webdriver:/);
  }, 20_000);
});
