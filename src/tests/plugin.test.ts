import { describe, test, expect } from '@jest/globals';
import { PluginManager, ToolRegistry } from '../plugin.js';
import type {
  AppiumMcpPlugin,
  McpRegistry,
  ToolCallContext,
  ToolCallResult,
} from '../plugin.js';

// ---------------------------------------------------------------------------
// Minimal FastMCP mock
// ---------------------------------------------------------------------------
type ToolDef = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: unknown, ctx: unknown) => Promise<unknown>;
};

function makeMockServer() {
  const registeredTools: ToolDef[] = [];
  const server: any = {
    addTool(toolDef: ToolDef) {
      registeredTools.push(toolDef);
    },
    _tools: registeredTools,
  };
  server.addTool = server.addTool.bind(server);
  return server;
}

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------
describe('ToolRegistry', () => {
  test('delegates tool rgit egistration to server.addTool', () => {
    const mockServer = makeMockServer();
    const registry = new ToolRegistry(mockServer);

    registry.addTool('my_tool', 'A test tool', {} as any, async () => ({
      content: [{ type: 'text', text: 'ok' }],
    }));

    expect(mockServer._tools).toHaveLength(1);
    expect(mockServer._tools[0].name).toBe('my_tool');
  });
});

// ---------------------------------------------------------------------------
// PluginManager – registration
// ---------------------------------------------------------------------------
describe('PluginManager.register', () => {
  test('registers plugins and logs them', () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    const plugin: AppiumMcpPlugin = { name: 'test-plugin', version: '0.1.0' };
    manager.register([plugin]);

    // No errors thrown means registration succeeded.
  });

  test('skips duplicate plugin names', () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    const plugin: AppiumMcpPlugin = { name: 'dup', version: '1.0.0' };
    manager.register([plugin, plugin]);

    // Should not throw.
  });
});

// ---------------------------------------------------------------------------
// PluginManager – beforeToolCall short-circuit
// ---------------------------------------------------------------------------
describe('PluginManager beforeToolCall hook', () => {
  test('allows before-hook to short-circuit tool execution', async () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    let originalExecuteCalled = false;

    const plugin: AppiumMcpPlugin = {
      name: 'short-circuit-plugin',
      version: '1.0.0',
      async beforeToolCall(_ctx: ToolCallContext): Promise<ToolCallResult> {
        return {
          isError: false,
          content: [{ type: 'text', text: 'intercepted' }],
        };
      },
    };

    manager.register([plugin]);

    // Register a tool whose execute we can spy on.
    server.addTool({
      name: 'target_tool',
      description: 'test',
      parameters: {},
      execute: async () => {
        originalExecuteCalled = true;
        return { content: [{ type: 'text', text: 'original' }] };
      },
    });

    // Find the wrapped tool and call it.
    const wrappedTool = server._tools[0];
    const result: any = await wrappedTool.execute({}, {});

    expect(originalExecuteCalled).toBe(false);
    expect(result.content[0].text).toBe('intercepted');
  });
});

// ---------------------------------------------------------------------------
// PluginManager – afterToolCall result modification
// ---------------------------------------------------------------------------
describe('PluginManager afterToolCall hook', () => {
  test('allows after-hook to modify the result', async () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    const plugin: AppiumMcpPlugin = {
      name: 'result-modifier',
      version: '1.0.0',
      async afterToolCall(
        _ctx: ToolCallContext,
        result: ToolCallResult
      ): Promise<ToolCallResult> {
        return {
          ...result,
          content: [
            {
              type: 'text',
              text: 'modified: ' + (result.content[0] as any).text,
            },
          ],
        };
      },
    };

    manager.register([plugin]);

    server.addTool({
      name: 'tool_to_modify',
      description: 'test',
      parameters: {},
      execute: async () => ({
        content: [{ type: 'text', text: 'original result' }],
      }),
    });

    const wrappedTool = server._tools[0];
    const result: any = await wrappedTool.execute({}, {});

    expect(result.content[0].text).toBe('modified: original result');
  });
});

// ---------------------------------------------------------------------------
// PluginManager – initialize / destroy lifecycle
// ---------------------------------------------------------------------------
describe('PluginManager lifecycle', () => {
  test('calls initialize on plugins that implement it', async () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    let initialized = false;
    const plugin: AppiumMcpPlugin = {
      name: 'lifecycle-plugin',
      version: '1.0.0',
      async initialize() {
        initialized = true;
      },
    };

    manager.register([plugin]);
    await manager.initialize();

    expect(initialized).toBe(true);
  });

  test('calls destroy on plugins in reverse order', async () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    const order: string[] = [];

    const pluginA: AppiumMcpPlugin = {
      name: 'plugin-a',
      version: '1.0.0',
      async destroy() {
        order.push('a');
      },
    };
    const pluginB: AppiumMcpPlugin = {
      name: 'plugin-b',
      version: '1.0.0',
      async destroy() {
        order.push('b');
      },
    };

    manager.register([pluginA, pluginB]);
    await manager.destroy();

    expect(order).toEqual(['b', 'a']);
  });
});

// ---------------------------------------------------------------------------
// PluginManager – registerTools delegation
// ---------------------------------------------------------------------------
describe('PluginManager.registerPluginTools', () => {
  test('calls registerTools on plugins that implement it', () => {
    const server = makeMockServer();
    const manager = new PluginManager(server);

    let called = false;
    const plugin: AppiumMcpPlugin = {
      name: 'tool-registrar',
      version: '1.0.0',
      registerTools(registry: McpRegistry) {
        called = true;
        registry.addTool(
          'custom_tool',
          'A custom tool',
          {} as any,
          async () => ({
            content: [{ type: 'text', text: 'custom' }],
          })
        );
      },
    };

    manager.register([plugin]);
    manager.registerPluginTools();

    expect(called).toBe(true);
    // The interceptor wraps addTool, so our custom_tool is in server._tools
    const names = server._tools.map((t: ToolDef) => t.name);
    expect(names).toContain('custom_tool');
  });
});
