import {logger} from '@appium/support';
import type {AppiumLogger} from '@appium/types';

import {isStdioTransportLoggingConfigured, markStdioTransportLoggingConfigured} from './stdio-logging-state.js';
import {quietExistingWdioLoggers} from './utils/wdio-logging.js';

const log: AppiumLogger = logger.getLogger('appium-mcp');

/** npmlog must not write to stdout (stdio JSON-RPC). Skip if the host already set a custom stream. */
export function ensureLoggerWritesToStderr(): void {
  const root = log.unwrap();
  if (root.stream === process.stdout) {
    root.stream = process.stderr;
  }
}

/** stdio transport: drop info/debug so they cannot sit on stdout. */
export function configureStdioTransportLogging(): void {
  if (isStdioTransportLoggingConfigured()) {
    return;
  }
  markStdioTransportLoggingConfigured();
  ensureLoggerWritesToStderr();
  log.level = 'warn';
  quietExistingWdioLoggers();
}

export default log;
export {log};

// For backward compatibility, export as named exports
// Note: @appium/support logger doesn't have trace method, using debug instead
export const trace = (message: string) => log.debug(message);
export const error = (message: string) => log.error(message);
