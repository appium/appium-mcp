declare module 'appium-xcuitest-driver' {
  export class XCUITestDriver {
    createSession(capabilities: any, w3cCapabilities: any): Promise<string>;
  }
}