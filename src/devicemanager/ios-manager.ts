import { Simctl } from 'node-simctl';
import { utilities } from 'appium-ios-device';
import log from '../logger.js';

export interface IOSDevice {
  name: string;
  udid: string;
  state?: string;
  type: 'simulator' | 'real';
  platform?: string;
}

/**
 * iOS Device Manager to list and manage iOS devices and simulators
 */
export class IOSManager {
  private static instance: IOSManager;
  private simctl: Simctl;

  private constructor() {
    this.simctl = new Simctl();
  }

  /**
   * Get the singleton instance of IOSManager
   */
  public static getInstance(): IOSManager {
    if (!IOSManager.instance) {
      IOSManager.instance = new IOSManager();
    }
    return IOSManager.instance;
  }

  /**
   * Check if running on macOS (required for iOS development)
   */
  public isMac(): boolean {
    return process.platform === 'darwin';
  }

  /**
   * List all iOS simulators
   * @returns Array of iOS simulators
   */
  public async listSimulators(): Promise<IOSDevice[]> {
    if (!this.isMac()) {
      log.warn('iOS simulators are only available on macOS');
      return [];
    }

    try {
      const devices = await this.simctl.getDevices();
      const simulators: IOSDevice[] = [];

      // devices is an object with runtime as key (e.g., "18.2") and array of devices as value
      // node-simctl returns simplified runtime keys that are already iOS versions
      for (const [runtime, deviceList] of Object.entries(devices)) {
        if (Array.isArray(deviceList)) {
          for (const device of deviceList) {
            simulators.push({
              name: device.name,
              udid: device.udid,
              state: device.state,
              type: 'simulator',
              platform: runtime, // Runtime is already the iOS version (e.g., "18.2")
            });
          }
        }
      }

      return simulators;
    } catch (error) {
      log.error(`Error listing iOS simulators: ${error}`);
      return [];
    }
  }

  /**
   * List only booted (running) iOS simulators
   * @returns Array of booted simulators
   */
  public async listBootedSimulators(): Promise<IOSDevice[]> {
    const allSimulators = await this.listSimulators();
    return allSimulators.filter((simulator) => simulator.state === 'Booted');
  }

  /**
   * List all connected real iOS devices
   * @returns Array of real iOS devices
   */
  public async listRealDevices(): Promise<IOSDevice[]> {
    if (!this.isMac()) {
      log.warn('iOS real devices are only available on macOS');
      return [];
    }

    try {
      const devices = await utilities.getConnectedDevices();
      return devices.map((udid: string) => ({
        name: udid, // We'll use UDID as name for now
        udid,
        type: 'real' as const,
      }));
    } catch (error) {
      log.error(`Error listing iOS real devices: ${error}`);
      return [];
    }
  }

  /**
   * Get all available iOS simulators
   * @returns Array of all iOS simulators (both booted and shutdown)
   */
  public async getAvailableSimulators(): Promise<IOSDevice[]> {
    return await this.listSimulators();
  }

  /**
   * Get all available real devices
   * @returns Array of real iOS devices
   */
  public async getAvailableRealDevices(): Promise<IOSDevice[]> {
    return await this.listRealDevices();
  }

  /**
   * Get devices based on device type
   * @param deviceType 'simulator' or 'real'
   * @returns Array of iOS devices
   */
  public async getDevicesByType(
    deviceType: 'simulator' | 'real'
  ): Promise<IOSDevice[]> {
    if (deviceType === 'simulator') {
      return await this.getAvailableSimulators();
    } else {
      return await this.getAvailableRealDevices();
    }
  }
}

/**
 * Global iOS Manager instance
 */
export const iosManager = IOSManager.getInstance();
