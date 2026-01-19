// Mock @appium/support for Jest tests
// This avoids the ESM/CommonJS mismatch with uuid dependency

export const logger = {
  getLogger: (name: string) =>
    // Simple logger implementation for tests
    // No-op functions that match the logger interface
    ({
      debug: (message: string, ...args: any[]) => {
        // Silent in tests by default
      },
      info: (message: string, ...args: any[]) => {
        // Silent in tests by default
      },
      warn: (message: string, ...args: any[]) => {
        // Silent in tests by default
      },
      error: (message: string, ...args: any[]) => {
        // Silent in tests by default
      },
      trace: (message: string, ...args: any[]) => {
        // Silent in tests by default
      },
    }),
};

// Export other commonly used utilities from @appium/support if needed
export default {
  logger,
};
