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

// Store selected local device globally
let selectedLocalDevice: SelectedLocalDevice | null = null;

type DevicesOk = { ok: true; devices: any[] };

type DevicesFail = { ok: false; result: ContentResult };

type SelectIOSOk = { ok: true; device: SelectedLocalDevice };

type SelectIOSFail = { ok: false; result: ContentResult };

export class SelectedLocalDevice {
  /**
   * Represents a selected local device for session creation.
   * This is used to store the user's device selection from the select_device tool.
   */
  private _udid: string | null;
  private _platform: 'android' | 'ios' | null;
  private _type: 'simulator' | 'real' | null;
  private _info: any;

  constructor(
    udid: string | null,
    platform: 'android' | 'ios' | null,
    type: 'simulator' | 'real' | null,
    info: any
  ) {
    this._udid = udid;
    this._platform = platform;
    this._type = type;
    this._info = info;
  }

  get udid(): string | null {
    return this._udid;
  }

  get platform(): 'android' | 'ios' | null {
    return this._platform;
  }

  get type(): 'simulator' | 'real' | null {
    return this._type;
  }

  get info(): any {
    return this._info;
  }
}

/**
 * @returns The currently selected local device, or null if no device is selected.
 */
export function getSelectedLocalDevice(): SelectedLocalDevice | null {
  return selectedLocalDevice;
}

/**
 * @returns
 */
export function clearSelectedDevice(): void {
  selectedLocalDevice = null;
}

export default function selectDevice(server: any): void {
  server.addTool({
    name: 'select_device',
    description:
      'LOCAL servers only: ask the user for platform, list devices, then select deviceUdid; one result auto-selects. ' +
      'For iOS also pass iosDeviceType and prepare simulators before session create. ' +
      'Skip for REMOTE servers; pass device capabilities to appium_session_management.',
    parameters: z
      .object({
        platform: z
          .enum(['ios', 'android'])
          .describe('Platform selected by the user.'),
        iosDeviceType: z
          .enum(['simulator', 'real'])
          .optional()
          .describe('Required for iOS: simulator or real.'),
        deviceUdid: z
          .string()
          .optional()
          .describe('Chosen UDID; omit to list devices.'),
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
): ContentResult | SelectedLocalDevice {
  const selectedDevice = devices.find((d) => d.udid === deviceUdid);
  if (!selectedDevice) {
    return errorResult(
      `Device with UDID "${deviceUdid}" not found. Available devices: ${devices.map((d) => d.udid).join(', ')}. Call select_device again with deviceUdid set to one of these values.`
    );
  }

  log.info(`Device selected: ${deviceUdid}`);
  selectedLocalDevice = new SelectedLocalDevice(
    deviceUdid,
    'android',
    null,
    selectedDevice
  );
  return selectedLocalDevice;
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
  return addUIResourceToResponse(textResponse, () =>
    createUIResource(
      `ui://appium-mcp/device-picker/android-${Date.now()}`,
      createDevicePickerUI(devices, 'android')
    )
  );
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

  log.info(
    `iOS ${iosDeviceType} selected: ${selectedDevice.name} (${deviceUdid})`
  );
  selectedLocalDevice = new SelectedLocalDevice(
    deviceUdid,
    'ios',
    iosDeviceType,
    selectedDevice
  );
  return {
    ok: true,
    device: selectedLocalDevice,
  };
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
  return addUIResourceToResponse(textResponse, () =>
    createUIResource(
      `ui://appium-mcp/device-picker/ios-${iosDeviceType}-${Date.now()}`,
      createDevicePickerUI(devices, 'ios', iosDeviceType)
    )
  );
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
    const selected = selectAndroidDevice(deviceUdid, devices);
    if (!(selected instanceof SelectedLocalDevice)) {
      return selected;
    }
    return formatAndroidSelectionResponse(deviceUdid);
  }

  // Auto-select when only one device is available
  if (devices.length === 1) {
    const selected = selectAndroidDevice(devices[0].udid, devices);
    if (!(selected instanceof SelectedLocalDevice)) {
      return selected;
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
    return formatIOSSelectionResponse(selected.device.info.name, deviceUdid);
  }

  // Auto-select when only one device is available
  if (devices.length === 1) {
    const selected = selectIOSDevice(devices[0].udid, devices, iosDeviceType!);
    if (!selected.ok) {
      return selected.result;
    }
    return formatIOSSelectionResponse(
      selected.device.info.name,
      devices[0].udid
    );
  }

  return formatIOSListResponse(devices, iosDeviceType!);
}
