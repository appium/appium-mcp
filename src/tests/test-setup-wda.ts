// Run with: npx tsx src/tests/test-setup-wda.ts
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {downloadWda, wdaVersion} from '../tools/ios/download-wda.js';

const temp = await mkdtemp(path.join(os.tmpdir(), 'appium-mcp-wda-'));
try {
  const bundle = await downloadWda(path.join(temp, 'real'), 'ios', 'real');
  console.log(`Downloaded and verified WDA v${wdaVersion} at ${bundle}`);
} finally {
  await rm(temp, {recursive: true, force: true});
}
