import { FastMCP } from 'fastmcp';
import pkg from '../package.json' with { type: 'json' };
import registerTools from './tools/index.js';
import registerResources from './resources/index.js';
import { listSessions, safeDeleteAllSessions } from './session-store.js';
import log from './logger.js';

// FastMCP types `version` as a literal `${number}.${number}.${number}` template,
// while `package.json.version` is just `string`. The cast is the supported
// escape hatch for projects that want the published version to flow through.
const SERVER_VERSION = pkg.version as `${number}.${number}.${number}`;

const SERVER_INSTRUCTIONS = [
  'Appium mobile automation through MCP. Defaults that avoid broken flows:',
  '- Establish a driver session first: select_device and appium_session_management (action=create) for local/embedded mode, or attach to a remote session when the user supplies a server URL.',
  '- Call only tools this server actually registers (appium_find_element, appium_gesture, appium_session_management, etc.); do not invent tool names or aliases.',
  '- Prefer stable locators: accessibility id and id before long xpath; use xpath only when nothing else works.',
  '- Use appium_gesture for taps and drags; when something is off-screen, use action=scroll_to_element instead of spamming appium_find_element alone.',
  '- For local Appium install, doctor, or smoke tests, run appium_skills before guessing commands.',
].join('\n');

type DisconnectSessionPolicy = 'delete_all' | 'skip';

/**
 * MCP disconnect policy for Appium sessions tracked by this server.
 * - delete_all (default): end every owned session when the MCP client disconnects (avoids leaked drivers).
 * - skip: keep sessions across disconnects — needed for flaky HTTP/stream clients that reconnect briefly.
 */
function disconnectSessionPolicyFromEnv(): DisconnectSessionPolicy {
  const raw = process.env.APPIUM_MCP_ON_CLIENT_DISCONNECT?.trim().toLowerCase();
  if (raw === 'skip') {
    return 'skip';
  }
  if (raw !== 'delete_all') {
    log.warn(
      `APPIUM_MCP_ON_CLIENT_DISCONNECT="${raw}" is not recognized (expected delete_all or skip); defaulting to delete_all`
    );
  }
  return 'delete_all';
}

const server = new FastMCP({
  name: 'MCP Appium',
  version: SERVER_VERSION,
  instructions: SERVER_INSTRUCTIONS,
});

registerResources(server);
registerTools(server);

// Handle client connection and disconnection events
server.on('connect', (event) => {
  log.info('Client connected:', event.session);
});

server.on('disconnect', async (event) => {
  log.info('Client disconnected:', event.session);
  const policy = disconnectSessionPolicyFromEnv();

  const ownedSessions = listSessions().filter(
    (session) => session.ownership === 'owned'
  );

  if (ownedSessions.length > 0 && policy === 'skip') {
    log.info(
      `${ownedSessions.length} owned session(s) retained after MCP disconnect ` +
        '(APPIUM_MCP_ON_CLIENT_DISCONNECT=skip). Delete explicitly via appium_session_management (action=delete) when finished.'
    );
    return;
  }

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
