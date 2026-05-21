/**
 * Example plugins for appium-mcp/core plugin API.
 *
 * These are illustrative only – not shipped as production code.
 *
 * Run the custom server:
 *   npx ts-node examples/plugin-example.ts
 */

import { createAppiumMcpServer } from '../dist/create-server.js';
import type {
  AppiumMcpPlugin,
  PluginContext,
  ToolCallContext,
  ToolCallResult,
  AppiumMcpCore,
  McpRegistry,
} from '../src/plugin.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Example 1: Plugin that registers a custom tool
// ---------------------------------------------------------------------------
class CheckoutPlugin implements AppiumMcpPlugin {
  readonly name = 'checkout-plugin';
  readonly version = '1.0.0';

  registerTools(registry: McpRegistry, _core: AppiumMcpCore): void {
    registry.addTool(
      'assert_checkout_summary',
      'Assert that the checkout summary screen shows the expected order ID.',
      z.object({ orderId: z.string().describe('The order ID to look for on screen') }),
      async ({ orderId }, ctx) => {
        // In a real plugin you would call the Appium driver via core.getDriver()
        // and inspect the page source.  This is a stub.
        const onScreen = false; // replace with real assertion
        if (!onScreen) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `Order ${orderId} not found on screen` }],
          };
        }
        return {
          content: [{ type: 'text' as const, text: `Checkout summary correct for ${orderId}` }],
        };
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Example 2: Plugin that wraps existing tools via lifecycle hooks
// ---------------------------------------------------------------------------
class LoginGuardPlugin implements AppiumMcpPlugin {
  readonly name = 'login-guard';
  readonly version = '1.0.0';

  async beforeToolCall(ctx: ToolCallContext): Promise<ToolCallResult | void> {
    if (
      ctx.toolName === 'appium_gesture' &&
      (ctx.args as { action?: string }).action === 'tap'
    ) {
      // Insert pre-conditions here (e.g. ensure user is logged in before tapping checkout).
      console.error(`[login-guard] Pre-tap check passed for ${ctx.toolName}`);
    }
  }

  async afterToolCall(
    ctx: ToolCallContext,
    result: ToolCallResult
  ): Promise<ToolCallResult | void> {
    if (result.isError) {
      // Capture artifacts on failure.
      console.error(`[login-guard] Tool ${ctx.toolName} failed – capturing artifacts`);
    }
    // Return nothing to pass through the original result.
  }
}

// ---------------------------------------------------------------------------
// Example 3: Plugin with async initialisation and teardown
// ---------------------------------------------------------------------------
class ArtifactPipelinePlugin implements AppiumMcpPlugin {
  readonly name = 'artifact-pipeline';
  readonly version = '1.0.0';

  async initialize(_ctx: PluginContext): Promise<void> {
    console.error('[artifact-pipeline] Connecting to artifact storage...');
    // await artifactStorage.connect();
  }

  async destroy(): Promise<void> {
    console.error('[artifact-pipeline] Disconnecting from artifact storage...');
    // await artifactStorage.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Wire everything together
// ---------------------------------------------------------------------------
const server = createAppiumMcpServer({
  plugins: [
    new CheckoutPlugin(),
    new LoginGuardPlugin(),
    new ArtifactPipelinePlugin(),
  ],
  additionalInstructions: 'Custom checkout and login-guard policies are active.',
});

// Start with stdio (default) or HTTP stream
const args = process.argv.slice(2);
void server.start({
  transportType: args.includes('--httpStream') ? 'httpStream' : 'stdio',
  ...(args.includes('--httpStream')
    ? { httpStream: { endpoint: '/sse', port: 8080 } }
    : {}),
});
