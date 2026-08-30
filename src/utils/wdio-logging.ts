import wdioLogger from '@wdio/logger';

import {QUIET_WEBDRIVER_LOG_LEVEL} from './webdriver-client-options.js';

type WdioLogLevel = NonNullable<Parameters<typeof wdioLogger.setLogLevelsConfig>[1]>;
type StdioWdioLogLevel = Extract<WdioLogLevel, string>;

const STDIO_SAFE_WDIO_LEVELS = new Set<StdioWdioLogLevel>(['warn', 'error', 'silent']);

function getStdioWdioLogLevel(): StdioWdioLogLevel {
  const configuredLevel = process.env.WDIO_LOG_LEVEL?.trim().toLowerCase() as StdioWdioLogLevel | undefined;
  return configuredLevel && STDIO_SAFE_WDIO_LEVELS.has(configuredLevel) ? configuredLevel : QUIET_WEBDRIVER_LOG_LEVEL;
}

/** Quiet every WDIO logger that was created before stdio config ran. */
export function quietExistingWdioLoggers(): void {
  const level = getStdioWdioLogLevel();
  process.env.WDIO_LOG_LEVEL = level;
  wdioLogger.setLogLevelsConfig({}, level);
}
