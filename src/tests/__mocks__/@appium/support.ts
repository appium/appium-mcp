// Mock @appium/support for Jest tests
// This avoids the ESM/CommonJS mismatch with uuid dependency

import { promises as fsPromises, existsSync } from 'node:fs';

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

export const net = {
  downloadFile: async (
    _remoteUrl: string,
    _dstPath: string,
    _opts?: unknown
  ) => {
    // Silent in tests by default
  },
};

export const plist = {
  parsePlistFile: async (_plistPath: string) => ({}),
};

export const zip = {
  extractAllTo: async (_zipPath: string, _destDir: string, _opts?: unknown) => {
    // Silent in tests by default
  },
  readEntries: async (_zipPath: string, _handler: unknown) => {
    // Silent in tests by default
  },
  toArchive: async (_dstPath: string, _src?: unknown, _opts?: unknown) => {
    // Silent in tests by default
  },
};

/**
 * Minimal `fs` mock that delegates to node:fs/promises so test code touching
 * the real filesystem continues to work.
 */
export const fs = {
  exists: async (p: string) => existsSync(p),
  readdir: (p: string) => fsPromises.readdir(p),
  stat: (p: string) => fsPromises.stat(p),
  readFile: (p: string, encoding?: BufferEncoding) =>
    fsPromises.readFile(p, encoding),
  writeFile: (p: string, data: string | Buffer) =>
    fsPromises.writeFile(p, data),
  unlink: (p: string) => fsPromises.unlink(p),
  rename: (from: string, to: string) => fsPromises.rename(from, to),
  mkdir: (p: string, opts?: { recursive?: boolean }) =>
    fsPromises.mkdir(p, opts),
  mkdirp: (p: string) => fsPromises.mkdir(p, { recursive: true }),
  mv: async (from: string, to: string) => {
    await fsPromises.rename(from, to);
  },
};

// Export other commonly used utilities from @appium/support if needed
export default {
  logger,
  imageUtil,
  net,
  plist,
  zip,
  fs,
};
