import { createAppiumMcpServer } from './create-server.js';
import { AppiumScreenshotPlugin } from './plugins/appium-screenshot.js';

const server = createAppiumMcpServer({
  plugins: [new AppiumScreenshotPlugin()],
});
export default server;
