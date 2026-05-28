import { createAppiumMcpServer } from './create-server.js';
import { createAppiumScreenshotPlugin } from './plugins/appium-screenshot.js';

const server = createAppiumMcpServer({
  plugins: [createAppiumScreenshotPlugin()],
});
export default server;
