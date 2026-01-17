import appiumConfig from '@appium/eslint-config-appium-ts';

import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';

export default [
  ...appiumConfig,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-case-declarations': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js'],
  },
];

  //   files: ['src/**/*.ts'],
  //   languageOptions: {
  //     parser: typescriptParser,
  //     parserOptions: {
  //       ecmaVersion: 'latest',
  //       sourceType: 'module',
  //     },
  //     globals: {
  //       console: 'readonly',
  //       process: 'readonly',
  //       Buffer: 'readonly',
  //       __dirname: 'readonly',
  //       __filename: 'readonly',
  //       global: 'readonly',
  //       module: 'readonly',
  //       require: 'readonly',
  //       exports: 'readonly',
  //     },
  //   },
  //   plugins: {
  //     '@typescript-eslint': typescript,
  //     prettier: prettier,
  //   },
  //   rules: {
  //     ...appiumConfig.rules,
  //     // Keep project-specific overrides here; base rules come from appiumConfig
  //     'no-console': 'off',
  //     'prettier/prettier': 'error',
  //     '@typescript-eslint/explicit-function-return-type': 'off',
  //     '@typescript-eslint/explicit-module-boundary-types': 'off',
  //     '@typescript-eslint/no-explicit-any': 'off',
  //     '@typescript-eslint/ban-ts-comment': 'off',
  //     'no-undef': 'off', // TypeScript handles this
  //     'no-case-declarations': 'off',
  //   },
  // },