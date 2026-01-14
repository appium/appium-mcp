/**
 * Tool to list all available Android emulators (AVDs)
 */
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import log from '../../logger.js';
import {
  createUIResource,
  createDevicePickerUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';

const execAsync = promisify(exec);

interface AndroidAVD {
  name: string;
  avdName: string;
  state: 'Running' | 'Shutdown';
  udid?: string;
  type: 'emulator';
}

/**
 * Get list of all available AVDs from Android SDK
 */
async function getAvailableAVDs(): Promise<string[]> {
  try {
    const { stdout, stderr } = await execAsync('emulator -list-avds');
    if (stderr && !stderr.includes('emulator')) {
      log.warn(`emulator command warning: ${stderr}`);
    }
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error: any) {
    log.error(`Failed to get AVD list: ${error.message}`);
    throw new Error(
      'Failed to list Android emulators. Please ensure Android SDK is installed and ANDROID_HOME is set.'
    );
  }
}

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
 * Get AVD name for a running emulator by its UDID
 */
async function getAVDNameForEmulator(udid: string): Promise<string | null> {
  try {
    const adbPath = getAdbPath();
    const { stdout } = await execAsync(`"${adbPath}" -s ${udid} emu avd name`, {
      timeout: 5000,
    });
    // Output format: "avd_name\nOK"
    const lines = stdout.trim().split('\n');
    return lines[0] || null;
  } catch (error: any) {
    log.warn(`Could not get AVD name for ${udid}: ${error.message}`);
    return null;
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
    // Skip header line "List of devices attached"
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
 * Get running emulators with their AVD names
 */
async function getRunningEmulators(): Promise<Map<string, string>> {
  const avdToUdid = new Map<string, string>();

  try {
    const emulators = await getConnectedEmulators();
    log.info(`Found ${emulators.length} running emulators: ${emulators.join(', ')}`);

    for (const udid of emulators) {
      const avdName = await getAVDNameForEmulator(udid);
      log.info(`Emulator ${udid} has AVD name: ${avdName}`);
      if (avdName) {
        avdToUdid.set(avdName, udid);
      }
    }
  } catch (error: any) {
    log.warn(`Could not get running emulators: ${error.message}`);
  }

  return avdToUdid;
}

/**
 * Build the complete AVD list with running state
 */
async function buildAVDList(): Promise<AndroidAVD[]> {
  const availableAVDs = await getAvailableAVDs();
  const runningEmulators = await getRunningEmulators();

  return availableAVDs.map(avdName => ({
    name: avdName,
    avdName: avdName,
    state: runningEmulators.has(avdName)
      ? ('Running' as const)
      : ('Shutdown' as const),
    udid: runningEmulators.get(avdName),
    type: 'emulator' as const,
  }));
}

export default function listAndroidEmulators(server: any): void {
  server.addTool({
    name: 'list_android_emulators',
    description: `List all available Android emulators (AVDs), including those not currently running.
      Use this tool to see all Android Virtual Devices configured on this machine.
      Returns the AVD name (used to launch emulators) and current running state.
      For running emulators, also returns the device UDID for use with create_session.`,
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        const avds = await buildAVDList();

        if (avds.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No Android emulators (AVDs) found.

To create an AVD:
1. Open Android Studio
2. Go to Tools > Device Manager
3. Click "Create Device"

Or use the command line:
  avdmanager create avd -n <name> -k <system-image>`,
              },
            ],
          };
        }

        const runningCount = avds.filter(a => a.state === 'Running').length;
        const avdList = avds
          .map((avd, index) => {
            const stateIcon = avd.state === 'Running' ? '🟢' : '⚪';
            if (avd.state === 'Running' && avd.udid) {
              return `  ${index + 1}. ${stateIcon} ${avd.state}
      AVD Name: ${avd.avdName} (for boot_android_emulator)
      Device ID: ${avd.udid} (for select_device / create_session)`;
            } else {
              return `  ${index + 1}. ${stateIcon} ${avd.state}
      AVD Name: ${avd.avdName} (for boot_android_emulator)
      Device ID: (available after boot)`;
            }
          })
          .join('\n\n');

        const textResponse = {
          content: [
            {
              type: 'text',
              text: `📱 Available Android Emulators (${avds.length} total, ${runningCount} running):

${avdList}

---
Usage:
  - boot_android_emulator: Use "AVD Name" to start an emulator
  - select_device / create_session: Use "Device ID" for running emulators`,
            },
          ],
        };

        // Add interactive UI picker
        const uiDevices = avds.map(avd => ({
          name: avd.name,
          udid: avd.avdName, // Use AVD name as identifier
          state: avd.state,
          type: 'emulator',
        }));

        const uiResource = createUIResource(
          `ui://appium-mcp/avd-picker/android-${Date.now()}`,
          createDevicePickerUI(uiDevices, 'android')
        );

        return addUIResourceToResponse(textResponse, uiResource);
      } catch (error: any) {
        log.error('Error listing Android emulators:', error);
        throw new Error(`Failed to list Android emulators: ${error.message}`);
      }
    },
  });
}
