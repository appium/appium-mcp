/**
 * Test file for setup-wda tool
 * Run with: npx tsx src/tests/test-setup-wda.ts
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock server object to test the tool
class MockServer {
  private tools: Map<string, any> = new Map();

  addTool(tool: any) {
    this.tools.set(tool.name, tool);
    console.log(`✅ Tool registered: ${tool.name}`);
  }

  getTool(name: string) {
    return this.tools.get(name);
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https
      .get(url, async (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          fs.unlinkSync(destPath);
          try {
            await downloadFile(response.headers.location!, destPath);
            resolve();
          } catch (err) {
            reject(err);
          }
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(
            new Error(`Failed to download: ${response.statusCode}`)
          );
        }

        const totalSize = parseInt(
          response.headers['content-length'] || '0',
          10
        );
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(
            `\r   Downloading... ${percent}% (${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)`
          );
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve();
        });
      })
      .on('error', (err) => {
        file.close();
        fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

async function unzipFile(zipPath: string, destDir: string): Promise<void> {
  console.log(`   Extracting to: ${destDir}`);
  await execAsync(`unzip -q "${zipPath}" -d "${destDir}"`);
  console.log('   ✅ Extraction complete');
}

function cachePath(folder: string): string {
  return path.join(os.homedir(), '.cache', 'appium-mcp', folder);
}

async function getLatestWDAVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/appium/WebDriverAgent/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'mcp-appium-test',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    https
      .get(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const release = JSON.parse(data);
            if (release.tag_name) {
              // Remove 'v' prefix if present
              const version = release.tag_name.replace(/^v/, '');
              resolve(version);
            } else {
              reject(new Error('No tag_name found in release data'));
            }
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

async function main() {
  console.log('🧪 Testing WDA Download and Setup\n');
  console.log('='.repeat(60));

  try {
    // Fetch latest WDA version from GitHub releases API
    console.log('\n🔍 Fetching latest WDA version from GitHub...');
    const wdaVersion = await getLatestWDAVersion();
    console.log(`✅ Latest WDA Version: v${wdaVersion}`);
    console.log(
      '   Source: https://github.com/appium/WebDriverAgent/releases/latest'
    );

    // Create cache directory structure using home directory
    const versionCacheDir = cachePath(`wda/${wdaVersion}`);
    const extractDir = path.join(versionCacheDir, 'extracted');
    const zipPath = path.join(
      versionCacheDir,
      'WebDriverAgentRunner-Runner.zip'
    );
    const appPath = path.join(extractDir, 'WebDriverAgentRunner-Runner.app');

    console.log('\n📁 Cache Directory:', versionCacheDir);
    console.log(`   (~/.cache/appium-device-farm/wda/${wdaVersion})`);

    // Check if this version is already cached
    if (fs.existsSync(appPath)) {
      console.log('\n✅ WDA version already cached! Skipping download.');
      console.log(`   Location: ${appPath}`);

      // Show app contents
      const appContents = fs.readdirSync(appPath);
      console.log('\n📋 Cached App bundle contents:');
      appContents.forEach((item) => {
        console.log(`      - ${item}`);
      });

      console.log('\n' + '='.repeat(60));
      console.log('🎉 Using cached WDA!');
      console.log(`💡 Cache location: ${versionCacheDir}`);
      return;
    }

    // Version not cached, proceed with download
    console.log('\n⚠️  Version not found in cache. Downloading...');

    // Create cache directories
    fs.mkdirSync(versionCacheDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    // Download URL
    const downloadUrl = `https://github.com/appium/WebDriverAgent/releases/download/v${wdaVersion}/WebDriverAgentRunner-Runner.zip`;

    console.log('\n⬇️  Downloading WDA from GitHub releases...');
    console.log(`   URL: ${downloadUrl}`);

    const startTime = Date.now();
    await downloadFile(downloadUrl, zipPath);
    const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`   ✅ Download complete (${downloadTime}s)`);

    // Check file size
    const stats = fs.statSync(zipPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   📦 File size: ${fileSizeMB} MB`);

    // Unzip the file
    console.log('\n📂 Extracting WDA bundle...');
    await unzipFile(zipPath, extractDir);

    // List contents
    console.log('\n📋 Extracted contents:');
    const contents = fs.readdirSync(extractDir);
    contents.forEach((item) => {
      const itemPath = path.join(extractDir, item);
      const isDir = fs.statSync(itemPath).isDirectory();
      console.log(`   ${isDir ? '📁' : '📄'} ${item}`);
    });

    // Check if WebDriverAgentRunner-Runner.app exists
    if (fs.existsSync(appPath)) {
      console.log('\n✅ WebDriverAgentRunner-Runner.app found!');
      console.log(`   Location: ${appPath}`);

      // Show app contents
      const appContents = fs.readdirSync(appPath);
      console.log('\n   App bundle contents:');
      appContents.forEach((item) => {
        console.log(`      - ${item}`);
      });
    } else {
      console.log('\n⚠️  WebDriverAgentRunner-Runner.app not found');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Download and setup completed successfully!');
    console.log(`\n💡 Cached location: ${versionCacheDir}`);
    console.log(
      '   This version will be reused on subsequent runs (no re-download needed)'
    );
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run main function
(async () => {
  try {
    await main();
  } catch (error: any) {
    console.error('\n💥 Unexpected error:', error);
    process.exit(1);
  }
})();
