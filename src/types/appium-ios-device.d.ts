declare module 'appium-ios-device' {
  export const utilities: {
    getConnectedDevices(): Promise<string[]>;
  };
}
