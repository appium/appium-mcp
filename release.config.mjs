import releaseConfig from '@appium/semantic-release-config';

export default releaseConfig({
  extraGitAssets: ['package-lock.json', 'server.json'],
});
