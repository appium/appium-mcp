import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';

import {zip as appiumZip} from '@appium/support';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust these paths for your use case
const ZIP_SOURCE_DIR = path.join(__dirname, '..', 'src', 'resources', 'submodules');
const ZIP_OUTPUT_PATH = path.join(__dirname, '..', 'src', 'resources', 'submodules.zip');
const UNZIP_TARGET_DIR = path.join(__dirname, '..', 'src', 'resources', 'submodules');

export async function zipAssets() {
  // appium/support exposes toInMemoryZip that returns base64 zip.[web:63]
  const zipBase64 = await appiumZip.toInMemoryZip(ZIP_SOURCE_DIR);
  const zipBuffer = Buffer.from(zipBase64, 'base64');
  await fs.writeFile(ZIP_OUTPUT_PATH, zipBuffer);
  console.log(`Zipped ${ZIP_SOURCE_DIR} -> ${ZIP_OUTPUT_PATH}`);
}

export async function unzipAssets() {
  // appium/support exposes extractAllTo path-based extraction.[web:63]
  await appiumZip.extractAllTo(ZIP_OUTPUT_PATH, UNZIP_TARGET_DIR);
  console.log(`Unzipped ${ZIP_OUTPUT_PATH} -> ${UNZIP_TARGET_DIR}`);
}

// Allow direct CLI usage: `node zip-assets.mjs zip` / `node zip-assets.mjs unzip`
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'zip') {
    zipAssets().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  } else if (cmd === 'unzip') {
    unzipAssets().catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  } else {
    console.log('Usage: node zip-assets.mjs [zip|unzip]');
  }
}
