import { createAppiumMcpServer } from './create-server.js';
import { AppiumDocumentation } from './tools/documentation/plugin.js';

const server = createAppiumMcpServer({
  plugins: [new AppiumDocumentation()],
});
export default server;
