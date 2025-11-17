/**
 * Tool to select mobile platform before creating a session
 */
import { ADBManager } from '../../devicemanager/adb-manager.js';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import { z } from 'zod';
import log from '../../logger.js';

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
 * Format multiple Android devices response
 */
function formatMultipleAndroidDevicesResponse(devices: any[]): any {
  const deviceList = devices
    .map((device, index) => `  ${index + 1}. ${device.udid}`)
    .join('\n');

  return {
    content: [
      {
        type: 'text',
        text: `✅ Android platform selected\n\n⚠️ Multiple Android devices/emulators found (${devices.length}):\n${deviceList}\n\n🚨 IMPORTANT: You MUST use the select_device tool next to ask the user which device they want to use.\n\nDO NOT proceed to create_session until the user has selected a specific device using the select_device tool.`,
      },
    ],
  };
}

/**
 * Format single Android device response
 */
function formatSingleAndroidDeviceResponse(deviceUdid: string): any {
  const platformInfo = `Android platform selected (Found device: ${deviceUdid})`;
  const nextSteps =
    `Found 1 Android device: ${deviceUdid}\n\n` +
    "You can now create an Android session using the create_session tool with platform='android'. Make sure you have:\n" +
    '• Android SDK installed\n' +
    '• Android device connected or emulator running\n' +
    '• USB debugging enabled (for real devices)';

  return {
    content: [
      {
        type: 'text',
        text: `✅ ${platformInfo}\n\n📋 Next Steps:\n${nextSteps}\n\n🚀 Ready to create a session? Use the create_session tool with platform='android'`,
      },
    ],
  };
}

/**
 * Validate macOS for iOS testing
 */
function validateMacOSForIOS(): void {
  const iosManager = IOSManager.getInstance();
  if (!iosManager.isMac()) {
    throw new Error('iOS testing is only available on macOS');
  }
}

/**
 * Format iOS device type selection prompt
 */
function formatIOSDeviceTypePrompt(): any {
  return {
    content: [
      {
        type: 'text',
        text: `✅ iOS platform selected\n\n📱 Please specify the device type:\n\n⚠️ IMPORTANT: You MUST call select_platform again with the iosDeviceType parameter.\n\nOptions:\n1. 'simulator' - Use iOS Simulator\n2. 'real' - Use real iOS device\n\n🚀 Call select_platform with:\n• platform='ios'\n• iosDeviceType='simulator' OR iosDeviceType='real'`,
      },
    ],
  };
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
    const deviceTypeText =
      iosDeviceType === 'simulator' ? 'simulators' : 'real devices';
    const helpText =
      iosDeviceType === 'simulator'
        ? 'Please start an iOS simulator using Xcode or use "xcrun simctl boot <SIMULATOR_UDID>"'
        : 'Please connect an iOS device via USB and ensure it is trusted';
    throw new Error(`No iOS ${deviceTypeText} found. ${helpText}`);
  }

  return devices;
}

/**
 * Format multiple iOS devices response
 */
function formatMultipleIOSDevicesResponse(
  devices: any[],
  iosDeviceType: 'simulator' | 'real'
): any {
  const deviceList = devices
    .map(
      (device, index) =>
        `  ${index + 1}. ${device.name} (${device.udid})${device.state ? ` - ${device.state}` : ''}`
    )
    .join('\n');
  const deviceTypeText =
    iosDeviceType === 'simulator' ? 'simulators' : 'devices';

  return {
    content: [
      {
        type: 'text',
        text: `✅ iOS platform selected (${iosDeviceType})\n\n⚠️ Multiple iOS ${deviceTypeText} found (${devices.length}):\n${deviceList}\n\n🚨 IMPORTANT: You MUST use the select_device tool next to ask the user which device they want to use.\n\nDO NOT proceed to create_session until the user has selected a specific device using the select_device tool.`,
      },
    ],
  };
}

/**
 * Format single iOS device response
 */
function formatSingleIOSDeviceResponse(
  device: any,
  iosDeviceType: 'simulator' | 'real'
): any {
  const platformInfo = `iOS ${iosDeviceType} selected (Found device: ${device.name} - ${device.udid})`;
  const nextSteps =
    `Found 1 iOS ${iosDeviceType}: ${device.name} (${device.udid})\n\n` +
    "You can now create an iOS session using the create_session tool with platform='ios'. Make sure you have:\n" +
    '• Xcode installed (macOS only)\n' +
    (iosDeviceType === 'simulator'
      ? '• iOS simulator running\n'
      : '• iOS device connected via USB\n• Developer certificates configured\n• Device trusted on your Mac\n');

  return {
    content: [
      {
        type: 'text',
        text: `✅ ${platformInfo}\n\n📋 Next Steps:\n${nextSteps}\n\n🚀 Ready to create a session? Use the create_session tool with platform='ios'`,
      },
    ],
  };
}

/**
 * Handle Android platform selection
 */
async function handleAndroidPlatformSelection(): Promise<any> {
  const devices = await getAndroidDevices();

  if (devices.length > 1) {
    return formatMultipleAndroidDevicesResponse(devices);
  }

  return formatSingleAndroidDeviceResponse(devices[0].udid);
}

/**
 * Handle iOS platform selection
 */
async function handleIOSPlatformSelection(
  iosDeviceType?: 'simulator' | 'real'
): Promise<any> {
  validateMacOSForIOS();

  if (!iosDeviceType) {
    return formatIOSDeviceTypePrompt();
  }

  const devices = await getIOSDevices(iosDeviceType);

  if (devices.length > 1) {
    return formatMultipleIOSDevicesResponse(devices, iosDeviceType);
  }

  return formatSingleIOSDeviceResponse(devices[0], iosDeviceType);
}

export default function selectPlatform(server: any): void {
  server.addTool({
    name: 'select_platform',
    description: `REQUIRED: First ASK THE USER which mobile platform they want to use (Android or iOS) before creating a session.
      DO NOT assume or default to any platform.
      You MUST explicitly prompt the user to choose between Android or iOS.
      This is mandatory before proceeding to use the create_session tool.
      `,
    parameters: z.object({
      platform: z
        .enum(['ios', 'android'])
        .describe(
          "REQUIRED: The platform chosen by the user - 'android' for Android devices/emulators or 'ios' for iOS devices/simulators. This must be based on the user's explicit choice, NOT a default assumption."
        ),
      iosDeviceType: z
        .enum(['simulator', 'real'])
        .optional()
        .describe(
          "For iOS only: Specify whether to use 'simulator' or 'real' device. REQUIRED when platform is 'ios'."
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        const { platform, iosDeviceType } = args;

        if (platform === 'android') {
          log.info('Platform selected: ANDROID');
          return await handleAndroidPlatformSelection();
        } else if (platform === 'ios') {
          log.info('Platform selected: IOS');
          return await handleIOSPlatformSelection(iosDeviceType);
        } else {
          throw new Error(
            `Invalid platform: ${platform}. Please choose 'android' or 'ios'.`
          );
        }
      } catch (error: any) {
        log.error(
          `[select_platform] ${error?.stack || error?.message || String(error)}`
        );
        throw new Error(`Failed to select platform: ${error.message}`);
      }
    },
  });
}
