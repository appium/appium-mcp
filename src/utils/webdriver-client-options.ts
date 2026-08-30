import {isStdioTransportLoggingConfigured} from '../stdio-logging-state.js';

export const QUIET_WEBDRIVER_LOG_LEVEL = 'warn' as const;

type QuietWebDriverLogging = {
  logLevel: typeof QUIET_WEBDRIVER_LOG_LEVEL;
  logLevels: Record<string, typeof QUIET_WEBDRIVER_LOG_LEVEL>;
};

/** `logLevel: warn` only after stdio logging is configured. */
export function withQuietWebDriverLogging<T extends Record<string, unknown>>(
  options: T,
): T | (T & QuietWebDriverLogging) {
  if (!isStdioTransportLoggingConfigured()) {
    return options;
  }

  const existingLogLevels =
    typeof options.logLevels === 'object' && options.logLevels !== null ? options.logLevels : {};

  return {
    ...options,
    logLevel: QUIET_WEBDRIVER_LOG_LEVEL,
    logLevels: {
      ...existingLogLevels,
      webdriver: QUIET_WEBDRIVER_LOG_LEVEL,
    },
  };
}
