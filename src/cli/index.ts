import log, {configureStdioTransportLogging} from '../logger.js';
import {loadCliPlugins} from './plugins.js';

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0];
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (!args.includes('--httpStream')) {
    configureStdioTransportLogging();
  }

  await startServer(args);
}

function printHelp(): void {
  log.info(`Usage: appium-mcp [command] [options]

Options:
  --httpStream  Start with httpStream transport
  --port=<port> Port for httpStream transport (default: 8080)
  --plugin=<module> Load a plugin from a local path or installed package (repeatable)
  --help        Show this help message`);
}

async function startServer(args: string[]): Promise<void> {
  const useHttpStream = args.includes('--httpStream');
  const port = args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || '8080';

  log.info('Starting MCP Appium MCP Server...');

  try {
    const plugins = await loadCliPlugins(args);
    const {default: createDefaultServer} = await import('../server.js');
    const server = await createDefaultServer(plugins);

    if (useHttpStream) {
      await server.start({
        transportType: 'httpStream',
        httpStream: {
          endpoint: '/sse',
          port: parseInt(port, 10),
        },
      });

      log.info(`Server started with httpStream transport on http://localhost:${port}/sse`);
      log.info('Waiting for client connections...');
    } else {
      await server.start({
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
