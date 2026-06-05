import { createAppiumMcpServer } from './create-server.js';

const plugins = [];

try {
  const { AppiumDocumentation } = await import('@appium/mcp-documentation');
  plugins.push(new AppiumDocumentation());
} catch (_err) {}

const server = createAppiumMcpServer({ plugins });
export default server;
