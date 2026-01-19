import { FastMCP } from 'fastmcp';
import registerTools from './tools/index.js';
import registerResources from './resources/index.js';
import { hasActiveSession, safeDeleteSession } from './session-store.js';
import log from './logger.js';

const server = new FastMCP({
  name: 'MCP Appium',
  version: '1.0.0',
  instructions:
    'Intelligent MCP server providing AI assistants with powerful tools and resources for Appium mobile automation',
});

registerResources(server);
registerTools(server);

// Handle client connection and disconnection events
server.on('connect', (event) => {
  log.info('Client connected:', event.session);
});

server.on('disconnect', async (event) => {
  log.info('Client disconnected:', event.session);
  // Only try to clean up if there's an active session
  if (hasActiveSession()) {
    try {
      log.info('Active session detected on disconnect, cleaning up...');
      const deleted = await safeDeleteSession();
      if (deleted) {
        log.info('Session cleaned up successfully on disconnect.');
      }
    } catch (error) {
      log.error('Error cleaning up session on disconnect:', error);
    }
  } else {
    log.info('No active session to clean up on disconnect.');
  }
});

export default server;
