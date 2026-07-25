import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxlint';

export default defineConfig({
  extends: [appiumConfig],
  ignorePatterns: [...ignorePatterns, 'node_modules/**', '**/dist/**'],
  rules: {
    'no-console': 'off',
  },
});
