import { createAppiumMcpServer } from './create-server.js';
import { AppiumDocument } from './tools/documentation/plugin.js';

const server = createAppiumMcpServer({
  plugins: [new AppiumDocument()],
});
export default server;
