import type { AppiumMcpPlugin } from './core.js';
import { createAppiumMcpServer } from './create-server.js';

const plugins: AppiumMcpPlugin[] = [];

try {
  const { AppiumDocumentation } = await import('@appium/mcp-documentation');
  plugins.push(new AppiumDocumentation());
} catch (_err) {}

const server = await createAppiumMcpServer({ plugins });
export default server;
