#!/usr/bin/env node

import server from './server.js';
import log from './logger.js';

// Parse command line arguments
const args = process.argv.slice(2);
const useHttpStream = args.includes('--httpStream');
const port =
  args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || '8080';

async function startServer(): Promise<void> {
  log.info('Starting MCP Appium MCP Server...');

  try {
    if (useHttpStream) {
      server.start({
        transportType: 'httpStream',
        httpStream: {
          endpoint: '/sse',
          port: parseInt(port, 10),
        },
      });

      log.info(
        `Server started with httpStream transport on http://localhost:${port}/sse`
      );
      log.info('Waiting for client connections...');
    } else {
      // Start with stdio transport
      server.start({
        transportType: 'stdio',
      });

      log.info('Server started with stdio transport');
      log.info('Waiting for client connections...');
    }
  } catch (error: any) {
    log.error('Error starting server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
