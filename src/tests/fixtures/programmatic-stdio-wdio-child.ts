import http from 'node:http';

import {createAppiumMcpServer} from '../../core.js';
import {createSessionAction} from '../../tools/session/create-session.js';

const mockServer = http.createServer((_req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(
    JSON.stringify({
      value: {
        sessionId: 'test-session',
        capabilities: {platformName: 'Android'},
      },
    }),
  );
});

await new Promise<void>((resolve) => {
  mockServer.listen(0, '127.0.0.1', () => resolve());
});

const {port} = mockServer.address() as {port: number};
const remoteServerUrl = `http://127.0.0.1:${port}/`;

try {
  const server = await createAppiumMcpServer();
  void server.start({transportType: 'stdio'});

  const result = await createSessionAction({
    platform: 'general',
    remoteServerUrl,
    capabilities: {platformName: 'Android'},
  });
  if (result.isError) {
    throw new Error('Remote session creation failed');
  }

  process.stderr.write('child-done\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
} finally {
  mockServer.close();
}
