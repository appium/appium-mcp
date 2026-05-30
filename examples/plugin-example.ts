/**
 * Example plugins for the appium-mcp/core plugin API.
 *
 * These examples are illustrative only. They show how a custom server can add
 * business-specific MCP capabilities and wrap the default Appium MCP tools.
 *
 * Run the custom server:
 *   npx ts-node examples/plugin-example.ts
 */

import {
  createAppiumMcpServer,
  type AppiumMcpCore,
  type AppiumMcpPlugin,
  type McpRegistry,
  type PluginContext,
  type ToolCallContext,
  type ToolCallResult,
} from '../dist/core.js';
import { z } from 'zod';

const text = (value: string) => ({ type: 'text' as const, text: value });
const checkoutSummaryParameters = z.object({
  orderId: z.string().describe('The order ID to look for on screen'),
});
const activeSessionPlatformParameters = z.object({
  platform: z.enum(['Android', 'iOS']),
});

type PageSourceDriver = {
  getPageSource(): Promise<string>;
};

// ---------------------------------------------------------------------------
// Example 1: Register custom tools and use AppiumMcpCore
// ---------------------------------------------------------------------------
class CheckoutPlugin implements AppiumMcpPlugin {
  readonly name = 'checkout-plugin';
  readonly version = '1.0.0';

  register(registry: McpRegistry, core: AppiumMcpCore): void {
    registry.addTool({
      name: 'assert_checkout_summary',
      description:
        'Assert that the checkout summary screen shows the expected order ID.',
      parameters: checkoutSummaryParameters,
      execute: async (args) => {
        const { orderId } = checkoutSummaryParameters.parse(args);
        const driver = core.getDriver() as PageSourceDriver | null;
        if (!driver) {
          return {
            isError: true,
            content: [
              text(
                'No active Appium session. Create or attach to a session first.'
              ),
            ],
          };
        }

        const pageSource = await driver.getPageSource();
        if (!pageSource.includes(orderId)) {
          return {
            isError: true,
            content: [text(`Order ${orderId} not found on screen`)],
          };
        }

        return {
          content: [text(`Checkout summary correct for ${orderId}`)],
        };
      }
    });

    registry.addTools([
      {
        name: 'list_business_sessions',
        description: 'Return Appium session IDs with simple business metadata.',
        parameters: z.object({}),
        execute: async () => {
          const sessions = core.listSessions();
          const summary =
            sessions.length === 0
              ? 'No active Appium sessions.'
              : sessions
                  .map(
                    (session) =>
                      `${session.sessionId}: ${session.platform ?? 'unknown'} / ${
                        session.deviceName ?? 'unknown device'
                      }${session.isActive ? ' (active)' : ''}`
                  )
                  .join('\n');

          return { content: [text(summary)] };
        },
      },
      {
        name: 'assert_active_session_platform',
        description:
          'Assert that the active Appium session is on the expected platform.',
        parameters: activeSessionPlatformParameters,
        execute: async (args) => {
          const { platform } = activeSessionPlatformParameters.parse(args);
          const activeSession = core
            .listSessions()
            .find((session) => session.isActive);
          if (!activeSession) {
            return {
              isError: true,
              content: [text('No active Appium session.')],
            };
          }

          if (activeSession.platform !== platform) {
            return {
              isError: true,
              content: [
                text(
                  `Expected ${platform}, but active session is ${
                    activeSession.platform ?? 'unknown'
                  }.`
                ),
              ],
            };
          }

          return {
            content: [text(`Active session is ${platform}.`)],
          };
        },
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Example 2: Register prompts, resources, and resource templates
// ---------------------------------------------------------------------------
class TestAssetsPlugin implements AppiumMcpPlugin {
  readonly name = 'test-assets';
  readonly version = '1.0.0';

  register(registry: McpRegistry): void {
    registry.addPrompt({
      name: 'mobile-bug-report',
      description: 'Create a concise mobile automation bug report.',
      arguments: [
        {
          name: 'screen',
          description: 'Screen or feature where the bug was observed',
          required: true,
        },
        {
          name: 'symptom',
          description: 'Observed failure or unexpected behavior',
          required: true,
        },
      ],
      load: async ({ screen, symptom }) =>
        [
          `Write a concise mobile bug report for the ${screen} screen.`,
          `Observed symptom: ${symptom}.`,
          'Include expected behavior, actual behavior, reproduction steps, and useful Appium artifacts.',
        ].join('\n'),
    });

    registry.addPrompts([
      {
        name: 'screen-model',
        description: 'Generate a simple screen model from observed controls.',
        arguments: [
          {
            name: 'platform',
            description: 'Mobile platform',
            required: true,
            enum: ['Android', 'iOS'],
          },
        ],
        load: async ({ platform }) =>
          `Create a ${platform} screen model with stable locators and high-level actions.`,
      },
    ]);

    registry.addResource({
      uri: 'business://policies/checkout',
      name: 'Checkout Automation Policy',
      description: 'Business rules for checkout automation.',
      mimeType: 'text/markdown',
      load: async () => ({
        text: [
          '# Checkout Automation Policy',
          '',
          '- Prefer accessibility id locators.',
          '- Confirm the order ID before completing payment.',
          '- Capture a screenshot whenever checkout assertions fail.',
        ].join('\n'),
      }),
    });

    registry.addResources([
      {
        uri: 'business://test-data/users',
        name: 'Example Test Users',
        description: 'Example user roles for app-specific tests.',
        mimeType: 'application/json',
        load: async () => ({
          text: JSON.stringify(
            {
              users: [
                { role: 'guest', username: 'guest@example.test' },
                { role: 'member', username: 'member@example.test' },
              ],
            },
            null,
            2
          ),
        }),
      },
    ]);

    registry.addResourceTemplate({
      uriTemplate: 'business://screens/{screen}',
      name: 'Screen Playbook',
      description: 'Screen-specific automation guidance.',
      mimeType: 'text/markdown',
      arguments: [
        {
          name: 'screen',
          description: 'Screen name',
          required: true,
          complete: async (value) => ({
            values: ['login', 'checkout', 'settings'].filter((screen) =>
              screen.startsWith(value)
            ),
          }),
        },
      ],
      load: async ({ screen }) => ({
        text: [
          `# ${screen} Screen Playbook`,
          '',
          '- Inspect the page source before choosing fallback locators.',
          '- Prefer high-level plugin tools when they exist.',
          '- Use appium_gesture for taps, swipes, and scrolls.',
        ].join('\n'),
      }),
    });
  }
}

// ---------------------------------------------------------------------------
// Example 3: Wrap existing tools with beforeCall / afterCall
// ---------------------------------------------------------------------------
class LoginGuardPlugin implements AppiumMcpPlugin {
  readonly name = 'login-guard';
  readonly version = '1.0.0';

  async beforeCall(ctx: ToolCallContext): Promise<ToolCallResult | void> {
    if (
      ctx.toolName === 'appium_gesture' &&
      (ctx.args as { action?: string }).action === 'tap'
    ) {
      const sessionInfo = ctx.session.getSessionInfo();
      console.error(
        `[login-guard] Pre-tap check passed for session ${sessionInfo?.sessionId ?? 'none'}`
      );
    }

    if (
      ctx.toolName === 'mobile_clear_app' &&
      process.env.ALLOW_CLEAR_APP !== 'true'
    ) {
      return {
        isError: true,
        content: [
          text(
            'Blocked mobile_clear_app. Set ALLOW_CLEAR_APP=true to allow destructive app cleanup.'
          ),
        ],
      };
    }
  }

  async afterCall(
    ctx: ToolCallContext,
    result: ToolCallResult
  ): Promise<ToolCallResult | void> {
    if (!result.isError) {
      return;
    }

    const sessionId = ctx.session.getSessionId();
    return {
      ...result,
      content: [
        ...result.content,
        text(
          `[login-guard] ${ctx.toolName} failed for session ${
            sessionId ?? 'none'
          }. Capture artifacts here in a real plugin.`
        ),
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Example 4: Async initialization and teardown
// ---------------------------------------------------------------------------
class ArtifactPipelinePlugin implements AppiumMcpPlugin {
  readonly name = 'artifact-pipeline';
  readonly version = '1.0.0';
  private connected = false;

  async initialize(ctx: PluginContext): Promise<void> {
    this.connected = true;
    console.error(
      `[artifact-pipeline] Connected. Loaded plugins: ${Array.from(
        ctx.plugins.keys()
      ).join(', ')}`
    );
  }

  async afterCall(
    ctx: ToolCallContext,
    result: ToolCallResult
  ): Promise<ToolCallResult | void> {
    if (this.connected && result.isError) {
      console.error(
        `[artifact-pipeline] Upload failure artifacts for ${ctx.toolName}`
      );
    }
  }

  async destroy(): Promise<void> {
    if (this.connected) {
      console.error('[artifact-pipeline] Disconnected from artifact storage.');
      this.connected = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Wire everything together
// ---------------------------------------------------------------------------
const server = createAppiumMcpServer({
  plugins: [
    new CheckoutPlugin(),
    new TestAssetsPlugin(),
    new LoginGuardPlugin(),
    new ArtifactPipelinePlugin(),
  ],
  additionalInstructions: [
    'Custom checkout policies, screen playbooks, and artifact hooks are active.',
    'Use plugin tools for business-level assertions when they match the task.',
  ].join('\n'),
});

const args = process.argv.slice(2);
void server.start({
  transportType: args.includes('--httpStream') ? 'httpStream' : 'stdio',
  ...(args.includes('--httpStream')
    ? { httpStream: { endpoint: '/sse', port: 8080 } }
    : {}),
});
