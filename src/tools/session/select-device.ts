/**
 * Tool to select a specific device when multiple devices are available
 */
import { ADBManager } from '../../devicemanager/adb-manager.js';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import { z } from 'zod';
import log from '../../logger.js';

// Store selected device globally
let selectedDeviceUdid: string | null = null;
let selectedDeviceType: 'simulator' | 'real' | null = null;
let selectedDeviceInfo: any = null;

export function getSelectedDevice(): string | null {
  return selectedDeviceUdid;
}

export function getSelectedDeviceType(): 'simulator' | 'real' | null {
  return selectedDeviceType;
}

export function getSelectedDeviceInfo(): any {
  return selectedDeviceInfo;
}

export function clearSelectedDevice(): void {
  selectedDeviceUdid = null;
  selectedDeviceType = null;
  selectedDeviceInfo = null;
}

/**
 * Get and validate Android devices
 */
async function getAndroidDevices(): Promise<any[]> {
  const adb = await ADBManager.getInstance().initialize();
  const devices = await adb.getConnectedDevices();

  if (devices.length === 0) {
    throw new Error('No Android devices/emulators found');
  }

  return devices;
}

/**
 * Validate and select Android device by UDID
 */
function selectAndroidDevice(deviceUdid: string, devices: any[]): void {
  const selectedDevice = devices.find(d => d.udid === deviceUdid);
  if (!selectedDevice) {
    throw new Error(
      `Device with UDID "${deviceUdid}" not found. Available devices: ${devices.map(d => d.udid).join(', ')}`
    );
  }

  selectedDeviceUdid = deviceUdid;
  log.info(`Device selected: ${deviceUdid}`);
}

/**
 * Format device selection response for Android
 */
function formatAndroidSelectionResponse(deviceUdid: string): any {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            message: `✅ Device selected: ${deviceUdid}`,
            instructions:
              '🚀 You can now create a session using the create_session tool with:',
            platform: 'android',
            capabilities: {
              'appium:udid': deviceUdid,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Format device list response for Android
 */
function formatAndroidListResponse(devices: any[]): any {
  const deviceList = devices
    .map((device, index) => `  ${index + 1}. ${device.udid}`)
    .join('\n');

  return {
    content: [
      {
        type: 'text',
        text: `📱 Available Android devices/emulators (${devices.length}):\n${deviceList}\n\n⚠️ IMPORTANT: Please ask the user which device they want to use.\n\nOnce the user selects a device, call this tool again with the deviceUdid parameter set to their chosen device UDID.`,
      },
    ],
  };
}

/**
 * Validate iOS device type
 */
function validateIOSDeviceType(
  iosDeviceType: 'simulator' | 'real' | undefined
): void {
  if (!iosDeviceType) {
    throw new Error(
      "For iOS platform, iosDeviceType ('simulator' or 'real') is required"
    );
  }
}

/**
 * Get and validate iOS devices by type
 */
async function getIOSDevices(
  iosDeviceType: 'simulator' | 'real'
): Promise<any[]> {
  const iosManager = IOSManager.getInstance();
  const devices = await iosManager.getDevicesByType(iosDeviceType);

  if (devices.length === 0) {
    throw new Error(
      `No iOS ${iosDeviceType === 'simulator' ? 'simulators' : 'devices'} found`
    );
  }

  return devices;
}

/**
 * Validate and select iOS device by UDID
 */
function selectIOSDevice(
  deviceUdid: string,
  devices: any[],
  iosDeviceType: 'simulator' | 'real'
): any {
  const selectedDevice = devices.find(d => d.udid === deviceUdid);
  if (!selectedDevice) {
    const deviceList = devices.map(d => `${d.name} (${d.udid})`).join(', ');
    throw new Error(
      `Device with UDID "${deviceUdid}" not found. Available devices: ${deviceList}`
    );
  }

  selectedDeviceUdid = deviceUdid;
  selectedDeviceType = iosDeviceType;
  selectedDeviceInfo = selectedDevice;
  log.info(
    `iOS ${iosDeviceType} selected: ${selectedDevice.name} (${deviceUdid})`
  );

  return selectedDevice;
}

/**
 * Format device selection response for iOS
 */
function formatIOSSelectionResponse(
  deviceName: string,
  deviceUdid: string
): any {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            message: `✅ Device selected: ${deviceName} (${deviceUdid})`,
            instructions:
              '🚀 You can now call the setup_wda tool to setup WDA on the simulator.',
            platform: 'ios',
            capabilities: {
              'appium:udid': deviceUdid,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Format device list response for iOS
 */
function formatIOSListResponse(
  devices: any[],
  iosDeviceType: 'simulator' | 'real'
): any {
  const deviceList = devices
    .map(
      (device, index) =>
        `  ${index + 1}. ${device.name} (${device.udid})${device.state ? ` - ${device.state}` : ''}`
    )
    .join('\n');

  return {
    content: [
      {
        type: 'text',
        text: `📱 Available iOS ${iosDeviceType === 'simulator' ? 'simulators' : 'devices'} (${devices.length}):\n${deviceList}\n\n⚠️ IMPORTANT: Please ask the user which device they want to use.\n\nOnce the user selects a device, call this tool again with the deviceUdid parameter set to their chosen device UDID.`,
      },
    ],
  };
}

/**
 * Handle Android device selection
 */
async function handleAndroidDeviceSelection(deviceUdid?: string): Promise<any> {
  const devices = await getAndroidDevices();

  if (deviceUdid) {
    selectAndroidDevice(deviceUdid, devices);
    return formatAndroidSelectionResponse(deviceUdid);
  }

  return formatAndroidListResponse(devices);
}

/**
 * Handle iOS device selection
 */
async function handleIOSDeviceSelection(
  iosDeviceType: 'simulator' | 'real' | undefined,
  deviceUdid?: string
): Promise<any> {
  validateIOSDeviceType(iosDeviceType);

  const devices = await getIOSDevices(iosDeviceType!);

  if (deviceUdid) {
    const selectedDevice = selectIOSDevice(deviceUdid, devices, iosDeviceType!);
    return formatIOSSelectionResponse(selectedDevice.name, deviceUdid);
  }

  return formatIOSListResponse(devices, iosDeviceType!);
}

export default function selectDevice(server: any): void {
  server.addTool({
    name: 'select_device',
    description: `REQUIRED when multiple devices are found: Ask the user to select which specific device they want to use from the available devices. 
      This tool lists all available devices and allows selection by UDID. 
      You MUST use this tool when select_platform returns multiple devices before calling create_session for android.
      You MUST use this tool when select_platform returns multiple devices before calling boot_simulator for ios if the user has selected simulator device type.
      `,
    parameters: z.object({
      platform: z
        .enum(['ios', 'android'])
        .describe(
          'The platform to list devices for (must match previously selected platform)'
        ),
      iosDeviceType: z
        .enum(['simulator', 'real'])
        .optional()
        .describe(
          "For iOS only: Specify whether to use 'simulator' or 'real' device. REQUIRED when platform is 'ios'."
        ),
      deviceUdid: z
        .string()
        .optional()
        .describe(
          'The UDID of the device selected by the user. If not provided, this tool will list available devices for the user to choose from.'
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        const { platform, iosDeviceType, deviceUdid } = args;

        if (platform === 'android') {
          return await handleAndroidDeviceSelection(deviceUdid);
        } else if (platform === 'ios') {
          return await handleIOSDeviceSelection(iosDeviceType, deviceUdid);
        } else {
          throw new Error(
            `Invalid platform: ${platform}. Please choose 'android' or 'ios'.`
          );
        }
      } catch (error: any) {
        log.error('Error selecting device:', error);
        throw new Error(`Failed to select device: ${error.message}`);
      }
    },
  });
}
