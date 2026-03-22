import { isAbsolute, join } from 'node:path';
import * as os from 'node:os';

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
