import os from 'node:os';
import path from 'node:path';

import {expect, test} from '@jest/globals';

test('loads applesign v7 via dynamic ESM import with expected options and output path contract', async () => {
  const {default: Applesign} = await import('applesign');
  expect(typeof Applesign).toBe('function');

  const ipaPath = path.join(os.tmpdir(), 'appium-mcp-test', 'Payload.ipa');
  const signer = new Applesign({
    file: ipaPath,
    bundleid: 'com.facebook.WebDriverAgentRunner.xctrunner',
    withGetTaskAllow: true,
    withoutPlugins: true,
  });

  try {
    expect(typeof signer.signIPA).toBe('function');
    expect(signer.config.file).toBe(path.resolve(ipaPath));
    expect(signer.config.bundleid).toBe('com.facebook.WebDriverAgentRunner.xctrunner');
    expect(signer.config.withGetTaskAllow).toBe(true);
    expect(signer.config.withoutPlugins).toBe(true);

    signer.setFile(ipaPath);
    expect(signer.config.outfile).toBe(path.join(path.dirname(path.resolve(ipaPath)), 'Payload-resigned.ipa'));
  } finally {
    await signer.cleanupTmp();
  }
});
