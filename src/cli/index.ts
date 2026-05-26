import log from '../logger.js';
import { runVerifyPluginCommand } from './verifyPlugin.js';

export async function runCli(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const command = args[0];
  if (command === 'verify') {
    await runVerifyPluginCommand(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
  } else {
    await startServer(args);
  }
}

function printHelp(): void {
  log.info(`Usage: appium-mcp [command] [options]

Commands:
  verify        Verify plugin/tool names are unique.
                The command will not start the server and will exit with code 0
                if no duplicates or registration errors are found, or 1
                otherwise.
                See options below.

Options:
  --plugin=<module-or-path>
                Include an external plugin module when running verify.
                Can be repeated. The module may export a plugin, plugin array,
                plugin class/function, or a "plugins" array.
                The report labels Appium MCP's own shipped tools as
                "appium-mcp core".
  --httpStream  Start with httpStream transport
  --port=<port> Port for httpStream transport (default: 8080)
  --help        Show this help message`);
}

async function startServer(args: string[]): Promise<void> {
  const useHttpStream = args.includes('--httpStream');
  const port =
    args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || '8080';

  log.info('Starting MCP Appium MCP Server...');

  try {
    const { default: server } = await import('../server.js');

    if (useHttpStream) {
      await server.start({
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
