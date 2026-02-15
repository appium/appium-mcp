// Mock @appium/support for Jest tests
// This avoids the ESM/CommonJS mismatch with uuid dependency

export const logger = {
  getLogger: (_name: string) =>
    // Simple logger implementation for tests
    // No-op functions that match the logger interface
    ({
      debug: (_message: string, ..._args: any[]) => {
        // Silent in tests by default
      },
      info: (_message: string, ..._args: any[]) => {
        // Silent in tests by default
      },
      warn: (_message: string, ..._args: any[]) => {
        // Silent in tests by default
      },
      error: (_message: string, ..._args: any[]) => {
        // Silent in tests by default
      },
      trace: (_message: string, ..._args: any[]) => {
        // Silent in tests by default
      },
    }),
};

// Export other commonly used utilities from @appium/support if needed
export default {
  logger,
};
