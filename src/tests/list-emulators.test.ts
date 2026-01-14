import { describe, test, expect, jest, beforeEach } from '@jest/globals';

/**
 * Interface for AndroidAVD (mirrors list-emulators.ts)
 */
interface AndroidAVD {
  name: string;
  avdName: string;
  state: 'Running' | 'Shutdown';
  udid?: string;
  type: 'emulator';
}

/**
 * Dependencies interface for testing
 */
interface ListEmulatorsDeps {
  execAsync: (command: string) => Promise<{ stdout: string; stderr: string }>;
  getConnectedDevices: () => Promise<Array<{ udid: string }>>;
}

/**
 * Get list of all available AVDs from Android SDK
 */
async function getAvailableAVDs(
  execAsync: ListEmulatorsDeps['execAsync']
): Promise<string[]> {
  try {
    const { stdout } = await execAsync('emulator -list-avds');
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error: any) {
    throw new Error(
      'Failed to list Android emulators. Please ensure Android SDK is installed and ANDROID_HOME is set.'
    );
  }
}

/**
 * Get AVD name for a running emulator by its UDID
 */
async function getAVDNameForEmulator(
  udid: string,
  execAsync: ListEmulatorsDeps['execAsync']
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`adb -s ${udid} emu avd name`);
    const lines = stdout.trim().split('\n');
    return lines[0] || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get running emulators with their AVD names
 */
async function getRunningEmulators(
  deps: ListEmulatorsDeps
): Promise<Map<string, string>> {
  const avdToUdid = new Map<string, string>();

  try {
    const devices = await deps.getConnectedDevices();

    for (const device of devices) {
      if (device.udid.startsWith('emulator-')) {
        const avdName = await getAVDNameForEmulator(device.udid, deps.execAsync);
        if (avdName) {
          avdToUdid.set(avdName, device.udid);
        }
      }
    }
  } catch (error) {
    // Return empty map on error
  }

  return avdToUdid;
}

/**
 * Build the complete AVD list with running state
 */
async function buildAVDList(deps: ListEmulatorsDeps): Promise<AndroidAVD[]> {
  const availableAVDs = await getAvailableAVDs(deps.execAsync);
  const runningEmulators = await getRunningEmulators(deps);

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

describe('getAvailableAVDs', () => {
  test('should parse AVD list correctly', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: 'Pixel_6_API_34\nPixel_4_API_30\nNexus_5X_API_28\n',
        stderr: '',
      })
    ) as any;

    const result = await getAvailableAVDs(mockExecAsync);

    expect(result).toEqual(['Pixel_6_API_34', 'Pixel_4_API_30', 'Nexus_5X_API_28']);
    expect(mockExecAsync).toHaveBeenCalledWith('emulator -list-avds');
  });

  test('should return empty array when no AVDs exist', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: '',
        stderr: '',
      })
    ) as any;

    const result = await getAvailableAVDs(mockExecAsync);

    expect(result).toEqual([]);
  });

  test('should handle single AVD', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: 'Pixel_6_API_34\n',
        stderr: '',
      })
    ) as any;

    const result = await getAvailableAVDs(mockExecAsync);

    expect(result).toEqual(['Pixel_6_API_34']);
  });

  test('should throw error when emulator command fails', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.reject(new Error('Command not found'))
    ) as any;

    await expect(getAvailableAVDs(mockExecAsync)).rejects.toThrow(
      'Failed to list Android emulators. Please ensure Android SDK is installed and ANDROID_HOME is set.'
    );
  });

  test('should filter empty lines', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: 'Pixel_6_API_34\n\n\nPixel_4_API_30\n',
        stderr: '',
      })
    ) as any;

    const result = await getAvailableAVDs(mockExecAsync);

    expect(result).toEqual(['Pixel_6_API_34', 'Pixel_4_API_30']);
  });
});

describe('getAVDNameForEmulator', () => {
  test('should return AVD name from emulator', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: 'Pixel_6_API_34\nOK',
        stderr: '',
      })
    ) as any;

    const result = await getAVDNameForEmulator('emulator-5554', mockExecAsync);

    expect(result).toBe('Pixel_6_API_34');
    expect(mockExecAsync).toHaveBeenCalledWith('adb -s emulator-5554 emu avd name');
  });

  test('should return null when command fails', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.reject(new Error('Connection refused'))
    ) as any;

    const result = await getAVDNameForEmulator('emulator-5554', mockExecAsync);

    expect(result).toBeNull();
  });

  test('should return null when stdout is empty', async () => {
    const mockExecAsync = jest.fn(() =>
      Promise.resolve({
        stdout: '',
        stderr: '',
      })
    ) as any;

    const result = await getAVDNameForEmulator('emulator-5554', mockExecAsync);

    expect(result).toBeNull();
  });
});

describe('getRunningEmulators', () => {
  test('should return map of running emulators', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'adb -s emulator-5554 emu avd name') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\nOK', stderr: '' });
        }
        if (cmd === 'adb -s emulator-5556 emu avd name') {
          return Promise.resolve({ stdout: 'Pixel_4_API_30\nOK', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([
          { udid: 'emulator-5554' },
          { udid: 'emulator-5556' },
        ])
      ) as any,
    };

    const result = await getRunningEmulators(mockDeps);

    expect(result.size).toBe(2);
    expect(result.get('Pixel_6_API_34')).toBe('emulator-5554');
    expect(result.get('Pixel_4_API_30')).toBe('emulator-5556');
  });

  test('should filter out non-emulator devices', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'adb -s emulator-5554 emu avd name') {
          return Promise.resolve({ stdout: 'Pixel_6_API_34\nOK', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.resolve([
          { udid: 'emulator-5554' },
          { udid: 'ABCD1234567890' }, // Physical device
        ])
      ) as any,
    };

    const result = await getRunningEmulators(mockDeps);

    expect(result.size).toBe(1);
    expect(result.get('Pixel_6_API_34')).toBe('emulator-5554');
  });

  test('should return empty map when no devices connected', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn(() => Promise.resolve({ stdout: '', stderr: '' })) as any,
      getConnectedDevices: jest.fn(() => Promise.resolve([])) as any,
    };

    const result = await getRunningEmulators(mockDeps);

    expect(result.size).toBe(0);
  });

  test('should return empty map when getConnectedDevices fails', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn(() => Promise.resolve({ stdout: '', stderr: '' })) as any,
      getConnectedDevices: jest.fn(() =>
        Promise.reject(new Error('ADB not running'))
      ) as any,
    };

    const result = await getRunningEmulators(mockDeps);

    expect(result.size).toBe(0);
  });
});

describe('buildAVDList', () => {
  test('should build complete AVD list with running state', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'emulator -list-avds') {
          return Promise.resolve({
            stdout: 'Pixel_6_API_34\nPixel_4_API_30\nNexus_5X_API_28\n',
            stderr: '',
          });
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

    const result = await buildAVDList(mockDeps);

    expect(result).toEqual([
      {
        name: 'Pixel_6_API_34',
        avdName: 'Pixel_6_API_34',
        state: 'Running',
        udid: 'emulator-5554',
        type: 'emulator',
      },
      {
        name: 'Pixel_4_API_30',
        avdName: 'Pixel_4_API_30',
        state: 'Shutdown',
        udid: undefined,
        type: 'emulator',
      },
      {
        name: 'Nexus_5X_API_28',
        avdName: 'Nexus_5X_API_28',
        state: 'Shutdown',
        udid: undefined,
        type: 'emulator',
      },
    ]);
  });

  test('should return empty array when no AVDs available', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'emulator -list-avds') {
          return Promise.resolve({ stdout: '', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() => Promise.resolve([])) as any,
    };

    const result = await buildAVDList(mockDeps);

    expect(result).toEqual([]);
  });

  test('should mark all as Shutdown when no emulators running', async () => {
    const mockDeps: ListEmulatorsDeps = {
      execAsync: jest.fn((cmd: string) => {
        if (cmd === 'emulator -list-avds') {
          return Promise.resolve({
            stdout: 'Pixel_6_API_34\nPixel_4_API_30\n',
            stderr: '',
          });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      }) as any,
      getConnectedDevices: jest.fn(() => Promise.resolve([])) as any,
    };

    const result = await buildAVDList(mockDeps);

    expect(result.every(avd => avd.state === 'Shutdown')).toBe(true);
    expect(result.every(avd => avd.udid === undefined)).toBe(true);
  });
});
