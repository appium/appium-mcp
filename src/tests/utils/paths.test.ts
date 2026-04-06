import { describe, expect, test } from '@jest/globals';
import { resolve } from 'node:path';
import {
  resolveAppiumResourcesPath,
  resolveScreenshotDir,
} from '../../utils/paths.js';

describe('paths utilities', () => {
  test('resolveAppiumResourcesPath returns src/resources root with no segments', () => {
    expect(resolveAppiumResourcesPath()).toBe(
      resolve(process.cwd(), 'src', 'resources')
    );
  });

  test('resolveAppiumResourcesPath appends resource segments correctly', () => {
    expect(
      resolveAppiumResourcesPath('submodules', 'appium-skills', 'AGENTS.md')
    ).toBe(
      resolve(
        process.cwd(),
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
