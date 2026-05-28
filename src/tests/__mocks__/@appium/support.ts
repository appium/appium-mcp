import { constants, existsSync, promises as fsPromises } from 'node:fs';

const noop = () => {};

export const logger = {
  getLogger: (_name: string) => ({
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    trace: noop,
  }),
};

export const fs = {
  hasAccess: async (p: string) => {
    try {
      await fsPromises.access(p, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },
  exists: async (p: string) => existsSync(p),
  readdir: (p: string) => fsPromises.readdir(p),
  stat: (p: string) => fsPromises.stat(p),
  readFile: (p: string, encoding?: BufferEncoding) =>
    fsPromises.readFile(p, encoding),
  writeFile: (p: string, data: string | Buffer, encoding?: BufferEncoding) =>
    fsPromises.writeFile(p, data, encoding),
  unlink: (p: string) => fsPromises.unlink(p),
  rename: (from: string, to: string) => fsPromises.rename(from, to),
  mkdir: (p: string, opts?: { recursive?: boolean }) =>
    fsPromises.mkdir(p, opts),
  mkdirp: (p: string) => fsPromises.mkdir(p, { recursive: true }),
  mv: async (from: string, to: string) => {
    await fsPromises.rename(from, to);
  },
};

export const imageUtil = {
  requireSharp: () => {
    throw new Error('imageUtil.requireSharp must be mocked by the test');
  },
};

export const util = {
  wrapElement: (elementId: string) => ({
    ELEMENT: elementId,
    'element-6066-11e4-a52e-4f735466cecf': elementId,
  }),
};

export const net = {
  downloadFile: async () => {},
};

export const plist = {
  parsePlistFile: async () => ({}),
};

export const zip = {
  extractAllTo: async () => {},
  readEntries: async () => {},
  toArchive: async () => {},
};

export default {
  logger,
  fs,
  imageUtil,
  util,
  net,
  plist,
  zip,
};
