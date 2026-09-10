import log, {configureStdioTransportLogging} from '../logger.js';
import {DEFAULT_HTTP_STREAM_OPTIONS, TRANSPORT_TYPES} from '../transport.js';
import type {ServerStartOptions} from '../transport.js';
import {CLI_COMMANDS, CLI_OPTIONS, CLI_VALUE_PREFIXES} from './options.js';
import {loadCliPlugins} from './plugins.js';

export async function runCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0];
  if (command === CLI_OPTIONS.help || command === CLI_OPTIONS.shortHelp || command === CLI_COMMANDS.help) {
    printHelp();
    return;
  }

  const useHttpStream = args.includes(CLI_OPTIONS.httpStream);
  if (!useHttpStream) {
    configureStdioTransportLogging();
  }

  await startServer(args, useHttpStream);
}

function printHelp(): void {
  log.info(`Usage: appium-mcp [command] [options]

Options:
  ${CLI_OPTIONS.httpStream}  Start with httpStream transport
  ${CLI_VALUE_PREFIXES.port}<port> Port for httpStream transport (default: ${DEFAULT_HTTP_STREAM_OPTIONS.port})
  ${CLI_VALUE_PREFIXES.plugin}<module> Load a plugin from a local path or installed package (repeatable)
  ${CLI_OPTIONS.help}        Show this help message`);
}

async function startServer(args: readonly string[], useHttpStream: boolean): Promise<void> {
  const port =
    args.find((arg) => arg.startsWith(CLI_VALUE_PREFIXES.port))?.split('=')[1] ||
    String(DEFAULT_HTTP_STREAM_OPTIONS.port);

  log.info('Starting MCP Appium MCP Server...');

  try {
    const plugins = await loadCliPlugins(args);
    const {default: createDefaultServer} = await import('../server.js');
    const server = await createDefaultServer(plugins);

    const startOptions: ServerStartOptions = useHttpStream
      ? {
          transportType: TRANSPORT_TYPES.httpStream,
          httpStream: {...DEFAULT_HTTP_STREAM_OPTIONS, port: parseInt(port, 10)},
        }
      : {transportType: TRANSPORT_TYPES.stdio};
    await server.start(startOptions);

    if (useHttpStream) {
      log.info(
        `Server started with httpStream transport on http://localhost:${port}${DEFAULT_HTTP_STREAM_OPTIONS.endpoint}`,
      );
    } else {
      log.info('Server started with stdio transport');
    }
    log.info('Waiting for client connections...');
  } catch (error: unknown) {
    log.error('Error starting server:', error);
    process.exit(1);
  }
}
