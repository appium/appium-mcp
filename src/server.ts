import { FastMCP } from 'fastmcp';
import registerTools from './tools/index.js';
import registerResources from './resources/index.js';
import { listSessions, safeDeleteAllSessions } from './session-store.js';
import log from './logger.js';

const server = new FastMCP({
  name: 'MCP Appium',
  version: '1.0.0',
  instructions:
    'Intelligent MCP server providing AI assistants with powerful tools and resources for Appium mobile automation. For local Appium environment setup or troubleshooting, use appium_skills before running installation, doctor, or smoke-test steps.',
});

registerResources(server);
registerTools(server);

// Handle client connection and disconnection events
server.on('connect', (event) => {
  log.info('Client connected:', event.session);
});

server.on('disconnect', async (event) => {
  log.info('Client disconnected:', event.session);
  const ownedSessions = listSessions().filter(
    (session) => session.ownership === 'owned'
  );
  if (ownedSessions.length > 0) {
    try {
      log.info(
        `${ownedSessions.length} owned session(s) detected on disconnect, cleaning up...`
      );
      const deletedCount = await safeDeleteAllSessions();
      log.info(
        `${deletedCount} session(s) cleaned up successfully on disconnect.`
      );
    } catch (error) {
      log.error('Error cleaning up session on disconnect:', error);
    }
  } else {
    log.info('No owned sessions to clean up on disconnect.');
  }
});

export default server;
