export default {
  preset: 'ts-jest/presets/js-with-ts-esm',
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
  testPathIgnorePatterns: ['/dist/', '/node_modules/'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  // Add this to ensure Jest can handle ESM
  // Exclude ES modules from transformation
  transformIgnorePatterns: [
    'node_modules/(?!(@xmldom|fast-xml-parser|xpath|uuid)/)',
  ],
};
