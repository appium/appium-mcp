import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves the screenshot directory path.
 * - If SCREENSHOTS_DIR is not set, returns os.tmpdir()
 * - If SCREENSHOTS_DIR is absolute, returns it as-is
 * - If SCREENSHOTS_DIR is relative, joins it with process.cwd()
 */
export function resolveScreenshotDir(): string {
  const screenshotDir = process.env.SCREENSHOTS_DIR;

  if (!screenshotDir) {
    return os.tmpdir();
  }

  if (isAbsolute(screenshotDir)) {
    return screenshotDir;
  }

  return join(process.cwd(), screenshotDir);
}

export function resolveAppiumResourcesPath(...segments: string[]): string {
  const packageRoot = resolve(__dirname, '..', '..');
  return resolve(packageRoot, 'src', 'resources', ...segments);
}
