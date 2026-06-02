/**
 * Tool to select a specific device when multiple devices are available
 */
import { ADBManager } from '../../devicemanager/adb-manager.js';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import { z } from 'zod';
import log from '../../logger.js';
import {
  createUIResource,
  createDevicePickerUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import type { ContentResult } from 'fastmcp';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';

// Store selected device globally
let selectedDeviceUdid: string | null = null;
let selectedDevicePlatform: 'android' | 'ios' | null = null;
let selectedDeviceType: 'simulator' | 'real' | null = null;
let selectedDeviceInfo: any = null;

type DevicesOk = { ok: true; devices: any[] };

type DevicesFail = { ok: false; result: ContentResult };

type SelectIOSOk = { ok: true; device: any };

type SelectIOSFail = { ok: false; result: ContentResult };

export function getSelectedDevice(): string | null {
  return selectedDeviceUdid;
}

export function getSelectedDevicePlatform(): 'android' | 'ios' | null {
  return selectedDevicePlatform;
}

export function getSelectedDeviceType(): 'simulator' | 'real' | null {
  return selectedDeviceType;
}
export function getSelectedDeviceInfo(): any {
  return selectedDeviceInfo;
}

export function clearSelectedDevice(): void {
  selectedDeviceUdid = null;
  selectedDevicePlatform = null;
  selectedDeviceType = null;
  selectedDeviceInfo = null;
}

export default function selectDevice(server: any): void {
  server.addTool({
    name: 'select_device',
    description: `Discover and select a device for LOCAL Appium servers ONLY.
      DO NOT use this tool for REMOTE Appium servers - remoteServerUrl indicates a remote server.
      WORKFLOW FOR LOCAL SERVERS:
      1. ASK THE USER which platform they want (Android or iOS) - do not assume
      2. Call this tool with the chosen platform (and iosDeviceType for iOS)
      3. If only one device is found, it is auto-selected - proceed to appium_session_management (action=create) (or prepare_ios_simulator for iOS simulators)
      4. If multiple devices are found, ask the user which one they want, then call this tool again with deviceUdid
      5. After selection, proceed to appium_session_management (action=create) (or prepare_ios_simulator for iOS simulators, then appium_session_management with action=create)
      WORKFLOW FOR REMOTE SERVERS:
      - SKIP this tool entirely
      - Device selection should be handled via capabilities on appium_session_management (action=create) (e.g., appium:deviceName, appium:udid)
      - The remote Appium server is already configured for specific device(s)
      `,
    parameters: z
      .object({
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
      })
      .refine(
        (data) => data.platform !== 'ios' || data.iosDeviceType !== undefined,
        {
          message:
            "iosDeviceType ('simulator' or 'real') is required when platform is 'ios'",
          path: ['iosDeviceType'],
        }
      ),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, _context: any): Promise<ContentResult> => {
      try {
        const { platform, iosDeviceType, deviceUdid } = args;

        if (platform === 'android') {
          return await handleAndroidDeviceSelection(deviceUdid);
        }
        if (platform === 'ios') {
          return await handleIOSDeviceSelection(iosDeviceType, deviceUdid);
        }
        return errorResult(
          `Invalid platform '${String(platform)}'. Use platform='android' or platform='ios'.`
        );
      } catch (error: unknown) {
        log.error('Error selecting device:', error);
        return errorResult(
          `Failed to select device. ${toolErrorMessage(error)}`
        );
      }
    },
  });
}

/**
 * Get and validate Android devices
 */
async function getAndroidDevices(): Promise<DevicesOk | DevicesFail> {
  const adb = await ADBManager.getInstance().initialize();
  const devices = await adb.getConnectedDevices();

  if (devices.length === 0) {
    return {
      ok: false,
      result: errorResult(
        'No Android devices or emulators found. Connect a USB device with USB debugging enabled, or start an Android emulator, then call select_device again with platform=android.'
      ),
    };
  }

  return { ok: true, devices };
}

/**
 * Validate and select Android device by UDID
 */
function selectAndroidDevice(
  deviceUdid: string,
  devices: any[]
): ContentResult | undefined {
  const selectedDevice = devices.find((d) => d.udid === deviceUdid);
  if (!selectedDevice) {
    return errorResult(
      `Device with UDID "${deviceUdid}" not found. Available devices: ${devices.map((d) => d.udid).join(', ')}. Call select_device again with deviceUdid set to one of these values.`
    );
  }

  selectedDeviceUdid = deviceUdid;
  selectedDevicePlatform = 'android';
  selectedDeviceType = null;
  selectedDeviceInfo = selectedDevice;
  log.info(`Device selected: ${deviceUdid}`);
  return undefined;
}

/**
 * Format device selection response for Android
 */
function formatAndroidSelectionResponse(deviceUdid: string): ContentResult {
  return textResult(
    JSON.stringify(
      {
        message: `✅ Device selected: ${deviceUdid}`,
        instructions:
          '🚀 You can now create a session by calling appium_session_management with action=create and:',
        platform: 'android',
        capabilities: {
          'appium:udid': deviceUdid,
        },
      },
      null,
      2
    )
  );
}

/**
 * Format device list response for Android
 */
function formatAndroidListResponse(devices: any[]): ContentResult {
  const deviceList = devices
    .map((device, index) => `  ${index + 1}. ${device.udid}`)
    .join('\n');

  const textResponse = textResult(
    `📱 Available Android devices/emulators (${devices.length}):\n${deviceList}\n\n⚠️ IMPORTANT: Please ask the user which device they want to use.\n\nOnce the user selects a device, call this tool again with the deviceUdid parameter set to their chosen device UDID.`
  );

  // Add interactive UI picker
  const uiResource = createUIResource(
    `ui://appium-mcp/device-picker/android-${Date.now()}`,
    createDevicePickerUI(devices, 'android')
  );

  return addUIResourceToResponse(textResponse, uiResource);
}

/**
 * Validate iOS device type
 */
function validateIOSDeviceType(
  iosDeviceType: 'simulator' | 'real' | undefined
): ContentResult | undefined {
  if (!iosDeviceType) {
    return errorResult(
      "iosDeviceType is required when platform=ios. Pass iosDeviceType='simulator' or iosDeviceType='real'."
    );
  }
  return undefined;
}
/**
 * Get and validate iOS devices by type
 */
async function getIOSDevices(
  iosDeviceType: 'simulator' | 'real'
): Promise<DevicesOk | DevicesFail> {
  const iosManager = IOSManager.getInstance();
  const devices = await iosManager.getDevicesByType(iosDeviceType);

  if (devices.length === 0) {
    return {
      ok: false,
      result: errorResult(
        `No iOS ${iosDeviceType === 'simulator' ? 'simulators' : 'devices'} found. Start a simulator in Xcode, or connect a real device with Developer Mode enabled, then call select_device again with platform=ios and iosDeviceType=${iosDeviceType}.`
      ),
    };
  }

  return { ok: true, devices };
}

/**
 * Validate and select iOS device by UDID
 */
function selectIOSDevice(
  deviceUdid: string,
  devices: any[],
  iosDeviceType: 'simulator' | 'real'
): SelectIOSOk | SelectIOSFail {
  const selectedDevice = devices.find((d) => d.udid === deviceUdid);
  if (!selectedDevice) {
    const deviceList = devices.map((d) => `${d.name} (${d.udid})`).join(', ');
    return {
      ok: false,
      result: errorResult(
        `Device with UDID "${deviceUdid}" not found. Available devices: ${deviceList}. Call select_device again with deviceUdid set to one of these values.`
      ),
    };
  }

  selectedDeviceUdid = deviceUdid;
  selectedDevicePlatform = 'ios';
  selectedDeviceType = iosDeviceType;
  selectedDeviceInfo = selectedDevice;
  log.info(
    `iOS ${iosDeviceType} selected: ${selectedDevice.name} (${deviceUdid})`
  );

  return { ok: true, device: selectedDevice };
}

/**
 * Format device selection response for iOS
 */
function formatIOSSelectionResponse(
  deviceName: string,
  deviceUdid: string
): ContentResult {
  return textResult(
    JSON.stringify(
      {
        message: `✅ Device selected: ${deviceName} (${deviceUdid})`,
        instructions:
          '🚀 You can now call the prepare_ios_simulator tool to boot and setup WDA on the simulator or the appium_prepare_ios_real_device tool to setup WDA on ios real device.',
        platform: 'ios',
        capabilities: {
          'appium:udid': deviceUdid,
        },
      },
      null,
      2
    )
  );
}

/**
 * Format device list response for iOS
 */
function formatIOSListResponse(
  devices: any[],
  iosDeviceType: 'simulator' | 'real'
): ContentResult {
  const deviceList = devices
    .map(
      (device, index) =>
        `  ${index + 1}. ${device.name} (${device.udid})${device.state ? ` - ${device.state}` : ''}`
    )
    .join('\n');

  const textResponse = textResult(
    `📱 Available iOS ${iosDeviceType === 'simulator' ? 'simulators' : 'devices'} (${devices.length}):\n${deviceList}\n\n⚠️ IMPORTANT: Please ask the user which device they want to use.\n\nOnce the user selects a device, call this tool again with the deviceUdid parameter set to their chosen device UDID.`
  );

  // Add interactive UI picker
  const uiResource = createUIResource(
    `ui://appium-mcp/device-picker/ios-${iosDeviceType}-${Date.now()}`,
    createDevicePickerUI(devices, 'ios', iosDeviceType)
  );

  return addUIResourceToResponse(textResponse, uiResource);
}

/**
 * Handle Android device selection
 */
async function handleAndroidDeviceSelection(
  deviceUdid?: string
): Promise<ContentResult> {
  const listed = await getAndroidDevices();
  if (!listed.ok) {
    return listed.result;
  }
  const { devices } = listed;

  if (deviceUdid) {
    const selectionError = selectAndroidDevice(deviceUdid, devices);
    if (selectionError) {
      return selectionError;
    }
    return formatAndroidSelectionResponse(deviceUdid);
  }

  // Auto-select when only one device is available
  if (devices.length === 1) {
    const selectionError = selectAndroidDevice(devices[0].udid, devices);
    if (selectionError) {
      return selectionError;
    }
    return formatAndroidSelectionResponse(devices[0].udid);
  }

  return formatAndroidListResponse(devices);
}

/**
 * Handle iOS device selection
 */
async function handleIOSDeviceSelection(
  iosDeviceType: 'simulator' | 'real' | undefined,
  deviceUdid?: string
): Promise<ContentResult> {
  const iosManager = IOSManager.getInstance();
  if (!iosManager.isMac()) {
    return errorResult(
      'iOS device selection requires macOS with Xcode installed.'
    );
  }

  const typeError = validateIOSDeviceType(iosDeviceType);
  if (typeError) {
    return typeError;
  }

  const listed = await getIOSDevices(iosDeviceType!);
  if (!listed.ok) {
    return listed.result;
  }
  const { devices } = listed;

  if (deviceUdid) {
    const selected = selectIOSDevice(deviceUdid, devices, iosDeviceType!);
    if (!selected.ok) {
      return selected.result;
    }
    return formatIOSSelectionResponse(selected.device.name, deviceUdid);
  }

  // Auto-select when only one device is available
  if (devices.length === 1) {
    const selected = selectIOSDevice(devices[0].udid, devices, iosDeviceType!);
    if (!selected.ok) {
      return selected.result;
    }
    return formatIOSSelectionResponse(selected.device.name, devices[0].udid);
  }

  return formatIOSListResponse(devices, iosDeviceType!);
}
