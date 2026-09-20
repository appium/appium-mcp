// Real Appium MCP discovery and handlers; only the device boundary is a fixture.
import {createAppiumMcpServer, configureStdioTransportLogging} from '../dist/core.js';
import {setSession} from '../dist/session-store.js';

configureStdioTransportLogging();
// Expose the real AI alternative so choosing it is a meaningful failure.
// The plugin intercepts it; these dummy credentials are never used for a request.
process.env.AI_VISION_ENABLED = 'true';
process.env.AI_VISION_API_BASE_URL = 'http://127.0.0.1:1';
process.env.AI_VISION_API_KEY = 'eval-fixture-unused';
process.env.APPIUM_MCP_OTEL_ENABLED = 'false';

const result = (text, isError = false) => ({isError, content: [{type: 'text', text}]});
class XCUITestDriver {
  async findElement(strategy, selector) {
    if (strategy !== 'accessibility id' || selector !== 'Login') {
      throw new Error('No such element');
    }
    return {'element-6066-11e4-a52e-4f735466cecf': 'eval-login'};
  }
  async getCurrentContext() {
    return 'NATIVE_APP';
  }
  async getContexts() {
    return ['NATIVE_APP'];
  }
  async deleteSession() {}
}
const activate = () =>
  setSession(new XCUITestDriver(), 'eval-ios', {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone',
  });
const state = process.env.APPIUM_EVAL_STATE ?? 'native';
if (!['native', 'selected'].includes(state)) {
  throw new Error(`Unknown eval state: ${state}`);
}
if (state === 'native') {
  await activate();
}

const server = await createAppiumMcpServer({
  plugins: [
    {
      name: 'behavioral-eval-device-fixture',
      version: '1.0.0',
      async beforeCall({toolName, args}) {
        if (toolName === 'appium_session_management' && args.action === 'create') {
          if (args.platform !== 'ios' || 'remoteServerUrl' in args) {
            return result('The fixture supports only the selected local iPhone.', true);
          }
          await activate();
          return result('Created session eval-ios on the selected local iPhone. Current context: NATIVE_APP.');
        }
        if (
          toolName === 'appium_find_element' ||
          toolName === 'appium_context' ||
          (toolName === 'appium_session_management' && args.action === 'list')
        ) {
          return;
        }
        // Keep alternatives discoverable without allowing device or network side effects.
        return result('This operation is not available in the behavioral eval device fixture.', true);
      },
    },
  ],
});
await server.start({transportType: 'stdio'});
