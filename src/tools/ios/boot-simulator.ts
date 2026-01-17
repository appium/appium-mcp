/**
 * Tool to boot iOS simulator
 */
import { z } from 'zod';
import { Simctl } from 'node-simctl';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';

export default function bootSimulator(server: any): void {
  server.addTool({
    name: 'boot_simulator',
    description: `Boot an iOS simulator and wait for it to be ready.
      This speeds up subsequent session creation by ensuring the simulator is already running.`,
    parameters: z.object({
      udid: z.string().describe(
        `The UDID of the iOS simulator to boot.
          Use select_platform and select_device tools first to get the UDID.`
      ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        const { udid } = args;

        // Verify it's a macOS system
        if (process.platform !== 'darwin') {
          throw new Error('iOS simulators can only be booted on macOS systems');
        }

        const iosManager = IOSManager.getInstance();
        const simulators = await iosManager.listSimulators();

        // Find the simulator with the given UDID
        const simulator = simulators.find((sim) => sim.udid === udid);

        if (!simulator) {
          throw new Error(
            `Simulator with UDID "${udid}" not found. Please use select_platform and select_device tools to get a valid UDID.`
          );
        }

        // Check current state
        if (simulator.state === 'Booted') {
          return {
            content: [
              {
                type: 'text',
                text: `✅ Simulator "${simulator.name}" is already booted and ready!\n\nUDID: ${udid}\niOS Version: ${simulator.platform || 'Unknown'}\nState: ${simulator.state}`,
              },
            ],
          };
        }

        const simctl = new Simctl();
        simctl.udid = udid;

        // Boot the device and measure time
        const bootStartTime = Date.now();
        await simctl.bootDevice();
        await simctl.startBootMonitor({ timeout: 120000 });
        const bootDuration = ((Date.now() - bootStartTime) / 1000).toFixed(1);

        return {
          content: [
            {
              type: 'text',
              text: `${JSON.stringify(
                {
                  instruction:
                    'You can now use the install_wda tool to install WDA on the simulator.',
                  status: 'Simulator booted successfully!',
                },
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        log.error('Error booting simulator:', error);
        throw new Error(`Failed to boot simulator: ${error.message}`);
      }
    },
  });
}
