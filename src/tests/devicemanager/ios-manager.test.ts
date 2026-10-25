import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';

const listSimulators = jest.fn<() => Promise<any[]>>();
jest.unstable_mockModule('@appium/coresim', () => ({
  NativeSimctl: class {
    getDevices = listSimulators;
  },
  SimDeviceState: {1: 'Shutdown', 3: 'Booted', ShuttingDown: 4},
}));
jest.unstable_mockModule('appium-ios-device', () => ({utilities: {getConnectedDevices: jest.fn()}}));
const {IOSManager} = await import('../../devicemanager/ios-manager.js');
const manager = IOSManager.getInstance();

beforeEach(() => {
  jest.spyOn(manager, 'isMac').mockReturnValue(true);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('simulator discovery', () => {
  test('preserves SDK versions and booted filtering from the flat device list', async () => {
    listSimulators.mockResolvedValue([
      {name: 'iPhone', udid: 'ios', state: 3, runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2'},
      {name: 'Apple TV', udid: 'tv', state: 1, runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.tvOS-18-1'},
    ]);
    expect(await manager.listSimulators()).toEqual([
      {name: 'iPhone', udid: 'ios', state: 'Booted', platform: '18.2', type: 'simulator'},
      {name: 'Apple TV', udid: 'tv', state: 'Shutdown', platform: '18.1', type: 'simulator'},
    ]);
    expect((await manager.listBootedSimulators()).map(({udid}) => udid)).toEqual(['ios']);
  });

  test('does not query native devices on other platforms', async () => {
    jest.spyOn(manager, 'isMac').mockReturnValue(false);
    expect(await manager.listSimulators()).toEqual([]);
    expect(listSimulators).not.toHaveBeenCalled();
  });

  test('returns an empty list if discovery fails', async () => {
    listSimulators.mockRejectedValue(new Error('CoreSimulator unavailable'));
    expect(await manager.listSimulators()).toEqual([]);
  });
});
