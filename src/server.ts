import { FastMCP } from 'fastmcp';
import registerTools from './tools/index.js';
import registerResources from './resources/index.js';
import { listSessions, safeDeleteAllSessions } from './session-store.js';
import log from './logger.js';

const server = new FastMCP({
  name: 'MCP Appium',
  version: '1.0.0',
  instructions:
    'Intelligent MCP server providing AI assistants with powerful tools and resources for Appium mobile automation and Playwright web browser automation',
});

registerResources(server);
registerTools(server);

// Handle client connection and disconnection events
server.on('connect', (event) => {
  log.info('Client connected:', event.session);
});

server.on('disconnect', async (event) => {
  log.info('Client disconnected:', event.session);
  const sessions = listSessions();
  if (sessions.length > 0) {
    try {
      log.info(
        `${sessions.length} active session(s) detected on disconnect, cleaning up...`
      );
      const deletedCount = await safeDeleteAllSessions();
      log.info(
        `${deletedCount} session(s) cleaned up successfully on disconnect.`
      );
    } catch (error) {
      log.error('Error cleaning up session on disconnect:', error);
    }
  } else {
    log.info('No active sessions to clean up on disconnect.');
  }
});

export default server;
