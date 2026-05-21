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

export function resolveAppiumMcpCachePath(...segments: string[]): string {
  return join(os.homedir(), '.cache', 'appium-mcp', ...segments);
}

/**
 * Returns the directory where remote-session persistence files live, or
 * `null` when the feature is disabled.
 *
 * Persistence is opt-in and configured via the
 * `APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH` environment variable:
 *
 * - Unset (or empty) -> persistence is disabled, no files are written.
 * - Set to a path -> persistence is enabled at that path. The path can be
 *   absolute or relative to the current working directory.
 *
 * Each session is persisted to its own `<sessionId>.json` file beneath
 * this directory so writes never collide across sessions.
 */
export function resolveAppiumMcpSessionsDir(): string | null {
  const raw = process.env.APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH?.trim();
  if (!raw) {
    return null;
  }
  return isAbsolute(raw) ? raw : join(process.cwd(), raw);
}
