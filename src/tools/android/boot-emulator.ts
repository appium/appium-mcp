/**
 * Tool to boot an Android emulator (AVD)
 */
import { z } from 'zod';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import log from '../../logger.js';

const execAsync = promisify(exec);

/**
 * Get the path to adb executable
 */
function getAdbPath(): string {
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome) {
    return `${androidHome}/platform-tools/adb`;
  }
  return 'adb';
}

/**
 * Get the path to emulator executable
 */
function getEmulatorPath(): string {
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome) {
    return `${androidHome}/emulator/emulator`;
  }
  return 'emulator';
}

/**
 * Get list of available AVDs
 */
async function getAvailableAVDs(): Promise<string[]> {
  try {
    const emulatorPath = getEmulatorPath();
    const { stdout } = await execAsync(`"${emulatorPath}" -list-avds`);
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Get connected emulators from adb devices command
 */
async function getConnectedEmulators(): Promise<string[]> {
  try {
    const adbPath = getAdbPath();
    const { stdout } = await execAsync(`"${adbPath}" devices`, {
      timeout: 10000,
    });
    const lines = stdout.trim().split('\n');
    const emulators: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.includes('device')) {
        const udid = line.split(/\s+/)[0];
        if (udid.startsWith('emulator-')) {
          emulators.push(udid);
        }
      }
    }
    return emulators;
  } catch (error: any) {
    log.warn(`Could not get connected emulators: ${error.message}`);
    return [];
  }
}

/**
 * Wait for a new emulator to appear (not in the initial list)
 */
async function waitForNewEmulator(
  initialEmulators: Set<string>,
  timeout: number
): Promise<string | null> {
  const startTime = Date.now();
  const checkInterval = 2000;

  while (Date.now() - startTime < timeout) {
    const currentEmulators = await getConnectedEmulators();
    for (const udid of currentEmulators) {
      if (!initialEmulators.has(udid)) {
        return udid;
      }
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  return null;
}

/**
 * Wait for emulator to be fully booted
 */
async function waitForEmulatorBoot(
  udid: string,
  timeout: number
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 2000;
  const adbPath = getAdbPath();

  while (Date.now() - startTime < timeout) {
    try {
      const { stdout } = await execAsync(
        `"${adbPath}" -s ${udid} shell getprop sys.boot_completed`,
        { timeout: 5000 }
      );
      if (stdout.trim() === '1') {
        return true;
      }
    } catch {
      // Emulator not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  return false;
}

export default function bootAndroidEmulator(server: any): void {
  server.addTool({
    name: 'boot_android_emulator',
    description: `Boot an Android emulator (AVD) and wait for it to be ready.
      Use list_android_emulators tool first to see available AVDs.
      This speeds up subsequent session creation by ensuring the emulator is already running.`,
    parameters: z.object({
      avdName: z.string().describe(
        `The name of the AVD to boot.
          Use list_android_emulators tool first to get available AVD names.`
      ),
      timeout: z
        .number()
        .optional()
        .default(120000)
        .describe(
          'Maximum time to wait for emulator to boot in milliseconds (default: 120000ms = 2 minutes)'
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        const { avdName, timeout = 120000 } = args;

        // Check if AVD exists
        const availableAVDs = await getAvailableAVDs();
        if (!availableAVDs.includes(avdName)) {
          throw new Error(
            `AVD "${avdName}" not found. Available AVDs: ${availableAVDs.join(', ') || 'none'}`
          );
        }

        // Get current emulators before starting
        const initialEmulators = new Set(await getConnectedEmulators());
        log.info(`Initial emulators: ${[...initialEmulators].join(', ') || 'none'}`);

        log.info(`Starting Android emulator: ${avdName}`);
        const bootStartTime = Date.now();

        // Start emulator in background
        const emulatorPath = getEmulatorPath();
        const emulatorProcess = spawn(emulatorPath, ['-avd', avdName, '-no-snapshot-load'], {
          detached: true,
          stdio: 'ignore',
        });
        emulatorProcess.unref();

        // Wait for new emulator to appear
        log.info('Waiting for emulator to connect...');
        const newUdid = await waitForNewEmulator(initialEmulators, timeout);

        if (!newUdid) {
          throw new Error(
            `Emulator "${avdName}" failed to start within ${timeout / 1000} seconds.`
          );
        }

        log.info(`New emulator detected: ${newUdid}`);

        // Wait for emulator to fully boot
        log.info('Waiting for boot to complete...');
        const bootCompleted = await waitForEmulatorBoot(newUdid, timeout);
        const bootDuration = ((Date.now() - bootStartTime) / 1000).toFixed(1);

        if (!bootCompleted) {
          return {
            content: [
              {
                type: 'text',
                text: `⚠️ Emulator "${avdName}" started but boot may not be complete.

AVD Name: ${avdName}
Device ID: ${newUdid}
Boot time: ${bootDuration}s (timed out)

You can try using create_session, but it may fail if not ready.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ Emulator "${avdName}" booted successfully!

AVD Name: ${avdName}
Device ID: ${newUdid}
Boot time: ${bootDuration}s

You can now use create_session with platform: "android".`,
            },
          ],
        };
      } catch (error: any) {
        log.error('Error booting Android emulator:', error);
        throw new Error(`Failed to boot Android emulator: ${error.message}`);
      }
    },
  });
}
