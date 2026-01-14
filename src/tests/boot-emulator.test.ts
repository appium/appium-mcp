import { describe, test, expect, jest } from '@jest/globals';

/**
 * Dependencies interface for testing
 */
interface BootEmulatorDeps {
  execAsync: (
    command: string,
    options?: { timeout?: number }
  ) => Promise<{ stdout: string; stderr: string }>;
  getConnectedDevices: () => Promise<Array<{ udid: string }>>;
}

/**
 * Check if an AVD exists
 */
async function checkAVDExists(
  avdName: string,
  execAsync: BootEmulatorDeps['execAsync']
): Promise<boolean> {
  try {
    const { stdout } = await execAsync('emulator -list-avds');
    const avds = stdout.trim().split('\n').filter(Boolean);
    return avds.includes(avdName);
  } catch (error) {
    return false;
  }
}

/**
 * Check if an AVD is already running
 */
async function getRunningAVDUdid(
  avdName: string,
  deps: BootEmulatorDeps
): Promise<string | null> {
  try {
    const devices = await deps.getConnectedDevices();

    for (const device of devices) {
      if (device.udid.startsWith('emulator-')) {
        try {
          const { stdout } = await deps.execAsync(
            `adb -s ${device.udid} emu avd name`,
            { timeout: 5000 }
          );
          const runningAvdName = stdout.trim().split('\n')[0];
          if (runningAvdName === avdName) {
            return device.udid;
          }
        } catch {
          // Continue checking other emulators
        }
      }
    }
  } catch (error) {
    // Return null on error
  }
  return null;
}

/**
 * Simulated boot result for testing
 */
interface BootResult {
  success: boolean;
  alreadyRunning: boolean;
  udid?: string;
  bootTime?: number;
  error?: string;
}

/**
 * Simulated boot logic for testing
 */
async function simulateBoot(
  avdName: string,
  deps: BootEmulatorDeps
): Promise<BootResult> {
  // Check if AVD exists
  const avdExists = await checkAVDExists(avdName, deps.execAsync);
  if (!avdExists) {
    return {
      success: false,
      alreadyRunning: false,
      error: `AVD "${avdName}" not found. Use list_android_emulators tool to see available AVDs.`,
    };
  }

  // Check if already running
  const existingUdid = await getRunningAVDUdid(avdName, deps);
  if (existingUdid) {
    return {
      success: true,
      alreadyRunning: true,
      udid: existingUdid,
    };
  }

  // Simulate successful boot
  return {
    success: true,
    alreadyRunning: false,
    udid: 'emulator-5554',
    bootTime: 15.5,
  };
}

describe('checkAVDExists', () => {
  test('should return true when AVD exists', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: 'Pixel_6_API_34\nPixel_4_API_30\n',
        stderr: '',
      })
    ) as any;

    const result = await checkAVDExists('Pixel_6_API_34', mockExecAsync);

    expect(result).toBe(true);
  });

  test('should return false when AVD does not exist', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: 'Pixel_6_API_34\nPixel_4_API_30\n',
        stderr: '',
      })
    ) as any;

    const result = await checkAVDExists('NonExistent_AVD', mockExecAsync);

    expect(result).toBe(false);
  });

  test('should return false when emulator command fails', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.reject(new Error('Command not found'))
    ) as any;

    const result = await checkAVDExists('Pixel_6_API_34', mockExecAsync);

    expect(result).toBe(false);
  });

  test('should return false when no AVDs available', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: '',
        stderr: '',
      })
    ) as any;

    const result = await checkAVDExists('Pixel_6_API_34', mockExecAsync);

    expect(result).toBe(false);
  });
});

describe('getRunningAVDUdid', () => {
  test('should return UDID when AVD is running', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'adb -s emulator-5554 emu avd name') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\nOK', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([{ udid: 'emulator-5554' }])
      ) as any,
    };

    const result = await getRunningAVDUdid('Pixel_6_API_34', mockDeps);

    expect(result).toBe('emulator-5554');
  });

  test('should return null when AVD is not running', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'adb -s emulator-5554 emu avd name') {
          return Promise.resolve({ stdout: 'Other_AVD\nOK', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([{ udid: 'emulator-5554' }])
      ) as any,
    };

    const result = await getRunningAVDUdid('Pixel_6_API_34', mockDeps);

    expect(result).toBeNull();
  });

  test('should return null when no emulators are running', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn(() =>
        Promise.resolve({ stdout: '', stderr: '' })
      ) as any,
      getConnectedDevices: jest.fn(() => Promise.resolve([])) as any,
    };

    const result = await getRunningAVDUdid('Pixel_6_API_34', mockDeps);

    expect(result).toBeNull();
  });

  test('should skip non-emulator devices', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn(() =>
        Promise.resolve({ stdout: '', stderr: '' })
      ) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([{ udid: 'ABCD1234567890' }]) // Physical device
      ) as any,
    };

    const result = await getRunningAVDUdid('Pixel_6_API_34', mockDeps);

    expect(result).toBeNull();
    // execAsync should not be called for physical devices
    expect(mockDeps.execAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('adb -s ABCD1234567890'),
      expect.anything()
    );
  });

  test('should handle multiple emulators and find correct one', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'adb -s emulator-5554 emu avd name') {
          return Promise.resolve({ stdout: 'Other_AVD\nOK', stderr: '' });
        }
        if (cmd === 'adb -s emulator-5556 emu avd name') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\nOK', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([{ udid: 'emulator-5554' }, { udid: 'emulator-5556' }])
      ) as any,
    };

    const result = await getRunningAVDUdid('Pixel_6_API_34', mockDeps);

    expect(result).toBe('emulator-5556');
  });
});

describe('simulateBoot', () => {
  test('should return error when AVD does not exist', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'emulator -list-avds') {
          return Promise.resolve({ stdout: 'Other_AVD\n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() => Promise.resolve([])) as any,
    };

    const result = await simulateBoot('NonExistent_AVD', mockDeps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('should return alreadyRunning when AVD is already booted', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'emulator -list-avds') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\n', stderr: '' });
        }
        if (cmd === 'adb -s emulator-5554 emu avd name') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\nOK', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([{ udid: 'emulator-5554' }])
      ) as any,
    };

    const result = await simulateBoot('Pixel_6_API_34', mockDeps);

    expect(result.success).toBe(true);
    expect(result.alreadyRunning).toBe(true);
    expect(result.udid).toBe('emulator-5554');
  });

  test('should return success when AVD boots successfully', async () => {
    const mockDeps: BootEmulatorDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'emulator -list-avds') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() => Promise.resolve([])) as any,
    };

    const result = await simulateBoot('Pixel_6_API_34', mockDeps);

    expect(result.success).toBe(true);
    expect(result.alreadyRunning).toBe(false);
    expect(result.udid).toBeDefined();
  });
});
