import { describe, expect, test } from '@jest/globals';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveAppiumResourcesPath,
  resolveScreenshotDir,
} from '../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Walk up from src/tests/utils to the package root
const packageRoot = resolve(__dirname, '..', '..', '..');

describe('paths utilities', () => {
  test('resolveAppiumResourcesPath returns src/resources root with no segments', () => {
    expect(resolveAppiumResourcesPath()).toBe(
      resolve(packageRoot, 'src', 'resources')
    );
  });

  test('resolveAppiumResourcesPath appends resource segments correctly', () => {
    expect(
      resolveAppiumResourcesPath('submodules', 'appium-skills', 'AGENTS.md')
    ).toBe(
      resolve(
        packageRoot,
        'src',
        'resources',
        'submodules',
        'appium-skills',
        'AGENTS.md'
      )
    );
  });

  test('resolveScreenshotDir respects relative SCREENSHOTS_DIR values', () => {
    process.env.SCREENSHOTS_DIR = 'artifacts/screenshots';

    expect(resolveScreenshotDir()).toBe(
      resolve(process.cwd(), 'artifacts', 'screenshots')
    );

    delete process.env.SCREENSHOTS_DIR;
  });
});
