import ts from 'typescript';

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

export default config;
