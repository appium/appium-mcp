import { logger } from '@appium/support';

const log = logger.getLogger('mcp-appium');

export default log;
export { log };

// For backward compatibility, export as named exports
// Note: @appium/support logger doesn't have trace method, using debug instead
export const trace = (message: string) => log.debug(message);
export const error = (message: string) => log.error(message);
