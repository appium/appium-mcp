import wdaPackage from 'appium-webdriveragent/package.json' with {type: 'json'};

export const wdaVersion = wdaPackage.version;

// The standalone repository used v-prefixed tags. The monorepo tags each package separately.
export const wdaReleaseDownloadUrl = wdaPackage.repository.url.endsWith('/appium/appium-ios.git')
  ? `https://github.com/appium/appium-ios/releases/download/appium-webdriveragent%40${wdaVersion}`
  : `https://github.com/appium/WebDriverAgent/releases/download/v${wdaVersion}`;
