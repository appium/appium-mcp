import {access, mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

import {exec} from 'teen_process';

// Embedded sessions use this driver. Resolve both its extension script and WDA from the same installation.
const require = createRequire(import.meta.url);
const driverManifest = require.resolve('appium-xcuitest-driver/package.json');
const driverRequire = createRequire(driverManifest);
const script = path.resolve(path.dirname(driverManifest), require(driverManifest).appium.scripts['download-wda']);
export const wdaVersion: string = driverRequire('appium-webdriveragent/package.json').version;

export async function downloadWda(
  destination: string,
  platform: 'ios' | 'tvos',
  kind: 'real' | 'sim',
  arch?: string,
): Promise<string> {
  const parent = path.dirname(destination);
  await mkdir(parent, {recursive: true});
  const staging = await mkdtemp(path.join(parent, '.wda-'));
  const outdir = path.join(staging, 'download');
  const bundle = platform === 'tvos' ? 'WebDriverAgentRunner_tvOS-Runner.app' : 'WebDriverAgentRunner-Runner.app';
  try {
    const args = [script, '--platform', platform, '--kind', kind, '--outdir', outdir];
    const nodeArch = process.arch === 'x64' ? 'x86_64' : process.arch;
    if (arch && arch !== nodeArch) {
      // download-wda chooses the simulator archive using the architecture of its Node process.
      await exec('/usr/bin/arch', [`-${arch}`, process.execPath, ...args], {timeout: 300000});
    } else {
      await exec(process.execPath, args, {timeout: 300000});
    }
    await access(path.join(outdir, bundle, 'Info.plist'));
    // Move the previous bundle aside as a unit so readers never see a partially deleted cache.
    try {
      await rename(destination, path.join(staging, 'previous'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    try {
      await rename(outdir, destination);
    } catch (err) {
      // Another prepare call may have published the same version and architecture first.
      if (!['ENOTEMPTY', 'EEXIST'].includes((err as NodeJS.ErrnoException).code ?? '')) {
        throw err;
      }
      await access(path.join(destination, bundle, 'Info.plist'));
    }
    return path.join(destination, bundle);
  } finally {
    await rm(staging, {recursive: true, force: true});
  }
}
