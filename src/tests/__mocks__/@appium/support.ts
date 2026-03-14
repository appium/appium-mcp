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

/**
 * Mock imageUtil for Jest tests.
 *
 * A single shared sharpInstance is used across all calls so tests can
 * inspect and override its methods (resize / jpeg / toBuffer) via
 * mockSharpInstance exported below.
 */

export type MockSharpInstance = {
  resizeCalls: Array<[number, number]>;
  toBufferImpl: () => Promise<Buffer>;
  resize: (w: number, h: number) => MockSharpInstance;
  jpeg: (_opts?: unknown) => MockSharpInstance;
  toBuffer: () => Promise<Buffer>;
  reset: () => void;
};

/** Shared instance – tests can mutate toBufferImpl or inspect resizeCalls */
export const mockSharpInstance: MockSharpInstance = {
  resizeCalls: [],
  toBufferImpl: () => Promise.resolve(Buffer.from('mock-compressed-image')),
  resize(w: number, h: number) {
    this.resizeCalls.push([w, h]);
    return this;
  },
  jpeg(_opts?: unknown) {
    return this;
  },
  toBuffer() {
    return this.toBufferImpl();
  },
  reset() {
    this.resizeCalls = [];
    this.toBufferImpl = () =>
      Promise.resolve(Buffer.from('mock-compressed-image'));
  },
};

export const imageUtil = {
  requireSharp: () => (_input: Buffer) => mockSharpInstance,
};

// Export other commonly used utilities from @appium/support if needed
export default {
  logger,
  imageUtil,
};
