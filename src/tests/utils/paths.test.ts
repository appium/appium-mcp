import { describe, expect, test } from '@jest/globals';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveAppiumResourcesPath,
  resolveScreenshotDir,
} from '../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..', '..', '..');

describe('paths utilities', () => {
  test('resolveAppiumResourcesPath returns src/resources root', () => {
    expect(resolveAppiumResourcesPath()).toBe(
      resolve(packageRoot, 'src', 'resources')
    );
  });

  test('resolveAppiumResourcesPath appends path segments', () => {
    expect(resolveAppiumResourcesPath('java', 'template.ts')).toBe(
      resolve(packageRoot, 'src', 'resources', 'java', 'template.ts')
    );
  });

  test('resolveScreenshotDir returns the configured screenshot directory', () => {
    process.env.SCREENSHOTS_DIR = 'artifacts/screenshots';

    expect(resolveScreenshotDir()).toBe(
      resolve(packageRoot, 'artifacts', 'screenshots')
    );

    delete process.env.SCREENSHOTS_DIR;
  });
});
