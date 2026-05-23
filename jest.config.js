import ts from 'typescript';
import crypto from 'node:crypto';

const TRANSFORM_CACHE_VERSION = 'appium-mcp-ts-transform-esm-v2';

const config = {
  testEnvironment: 'node',
  // Restrict Jest to the source tree to avoid discovering compiled tests under dist/
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock @appium/support to avoid ESM/CommonJS issues with uuid
    '^@appium/support$': '<rootDir>/src/tests/__mocks__/@appium/support.ts',
  },
  modulePathIgnorePatterns: [
    '<rootDir>/src/resources/submodules/', // Ignores everything in submodules
  ],
  // Ignore compiled files under dist to prevent duplicate test discovery
  testPathIgnorePatterns: ['/dist/', '/node_modules/', '/src/resources/submodules'],
  transform: {
    '^.+\\.tsx?$': [
      '<rootDir>/jest.config.js',
    ],
  },
  // Add this to ensure Jest can handle ESM
  // Exclude ES modules from transformation
  transformIgnorePatterns: [
    'node_modules/(?!(@xmldom|fast-xml-parser|xpath|uuid)/)',
  ],
};

Object.defineProperty(config, 'process', {
  enumerable: false,
  value(sourceText, sourcePath) {
    const { outputText } = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        inlineSourceMap: true,
        inlineSources: true,
        esModuleInterop: true,
      },
    });

    return {
      code: outputText,
    };
  },
});

Object.defineProperty(config, 'getCacheKey', {
  enumerable: false,
  value(sourceText, sourcePath, transformOptions) {
    return crypto
      .createHash('sha256')
      .update(TRANSFORM_CACHE_VERSION)
      .update('\0')
      .update(sourcePath)
      .update('\0')
      .update(sourceText)
      .update('\0')
      .update(transformOptions.configString)
      .digest('hex');
  },
});

export default config;
