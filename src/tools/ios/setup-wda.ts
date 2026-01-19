/**
 * Tool to download and setup WebDriverAgent (WDA) for iOS simulators
 */
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { access, mkdir, unlink } from 'fs/promises';
import { constants, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import os from 'os';
import axios from 'axios';
import log from '../../logger.js';

const execAsync = promisify(exec);

function cachePath(folder: string): string {
  return path.join(os.homedir(), '.cache', 'appium-mcp', folder);
}

async function getLatestWDAVersion(): Promise<string> {
  try {
    const response = await axios.get(
      'https://api.github.com/repos/appium/WebDriverAgent/releases/latest',
      {
        headers: {
          'User-Agent': 'mcp-appium',
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    const release = response.data;
    if (release.tag_name) {
      return release.tag_name.replace(/^v/, '');
    } else {
      throw new Error('No tag_name found in release data');
    }
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `Failed to fetch WDA version: ${error.response.status} ${error.response.statusText}`
      );
    }
    throw error;
  }
}

async function cleanupFile(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
    await unlink(path);
  } catch {
    // File doesn't exist or already deleted
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      maxRedirects: 5,
    });

    const writer = createWriteStream(destPath);

    try {
      await pipeline(response.data, writer);
    } catch (streamError: any) {
      writer.close();
      await cleanupFile(destPath);
      throw streamError;
    }
  } catch (error: any) {
    // Clean up partial file on error
    await cleanupFile(destPath);

    if (error.response) {
      throw new Error(
        `Failed to download: ${error.response.status} ${error.response.statusText}`
      );
    }
    throw error;
  }
}

async function unzipFile(zipPath: string, destDir: string): Promise<void> {
  await execAsync(`unzip -q "${zipPath}" -d "${destDir}"`);
}

export default function setupWDA(server: any): void {
  server.addTool({
    name: 'setup_wda',
    description: `Download and setup prebuilt WebDriverAgent (WDA) for iOS/tvOS simulators only (not for real devices).
      This significantly speeds up the first Appium session by avoiding the need to build WDA from source.
      Downloads the latest version from GitHub and caches it locally.
      `,
    parameters: z.object({
      platform: z
        .enum(['ios', 'tvos'])
        .optional()
        .default('ios')
        .describe(
          `The simulator platform to download WDA for.
          Default is "ios".
          Use "tvos" for Apple TV simulators.
          Note: This tool only works with simulators, not real devices.`
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        const { platform = 'ios' } = args;

        // Verify it's a macOS system
        if (process.platform !== 'darwin') {
          throw new Error(
            'WebDriverAgent setup is only supported on macOS systems'
          );
        }

        // Get the architecture
        const arch = os.arch();
        const archStr = arch === 'arm64' ? 'arm64' : 'x86_64';

        // Fetch latest WDA version from GitHub
        const wdaVersion = await getLatestWDAVersion();

        // Create cache directory structure
        const versionCacheDir = cachePath(`wda/${wdaVersion}`);
        const extractDir = path.join(versionCacheDir, 'extracted');
        const zipPath = path.join(
          versionCacheDir,
          `WebDriverAgentRunner-Build-Sim-${archStr}.zip`
        );
        const appPath = path.join(
          extractDir,
          'WebDriverAgentRunner-Runner.app'
        );

        // Check if this version is already cached
        try {
          await access(appPath, constants.F_OK);
          return {
            content: [
              {
                type: 'text',
                text: `✅ WebDriverAgent is already set up!\n\nVersion: ${wdaVersion}\nPlatform: ${platform} (simulator only)\nArchitecture: ${archStr}\nLocation: ${appPath}\nCache: ~/.cache/appium-mcp/wda/${wdaVersion}\n\n🚀 You can now create an Appium session without needing to build WDA from source.`,
              },
            ],
          };
        } catch {
          // File doesn't exist, continue to download
        }

        // Version not cached, download it
        const startTime = Date.now();

        // Create cache directories
        await mkdir(versionCacheDir, { recursive: true });
        await mkdir(extractDir, { recursive: true });

        // Download URL - use architecture-specific filename
        const downloadUrl = `https://github.com/appium/WebDriverAgent/releases/download/v${wdaVersion}/WebDriverAgentRunner-Build-Sim-${archStr}.zip`;

        log.info(
          `Downloading prebuilt WDA v${wdaVersion} for ${platform} simulator...`
        );

        await downloadFile(downloadUrl, zipPath);

        log.info('Extracting WebDriverAgent...');
        await unzipFile(zipPath, extractDir);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        // Verify extraction
        try {
          await access(appPath, constants.F_OK);
        } catch {
          throw new Error(
            'WebDriverAgent extraction failed - app bundle not found'
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: `${JSON.stringify(
                {
                  version: wdaVersion,
                  platform,
                  architecture: archStr,
                  wdaAppPath: appPath,
                  wdaCachePath: `~/.cache/appium-mcp/wda/${wdaVersion}`,
                  simulatorOnly: true,
                  ready: true,
                },
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        log.error('Error setting up WDA:', error);
        throw new Error(`Failed to setup WebDriverAgent: ${error.message}`);
      }
    },
  });
}
