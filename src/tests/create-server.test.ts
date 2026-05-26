import { afterEach, describe, expect, jest, test } from '@jest/globals';
import type {
  AppiumMcpPlugin,
  ToolCallContext,
  ToolCallResult,
} from '../plugin.js';
import { z } from 'zod';

type ToolDef = {
  name: string;
  description?: string;
  parameters?: unknown;
  execute: (args: unknown, ctx: unknown) => Promise<unknown>;
};

type ResourceDef = {
  uri: string;
  name?: string;
  load: () => Promise<unknown>;
};

const registeredServers: MockFastMCP[] = [];
const safeDeleteAllSessions = jest.fn<() => Promise<number>>();
let sessions: Array<{
  sessionId: string;
  isActive: boolean;
  ownership: string;
}> = [];
const testToolParameters = z.object({});

class MockFastMCP {
  readonly tools: ToolDef[] = [];
  readonly resources: ResourceDef[] = [];
  private readonly handlers = new Map<
    string,
    Array<(event: unknown) => unknown>
  >();

  constructor(readonly options: unknown) {
    registeredServers.push(this);
  }

  addTool(toolDef: ToolDef): void {
    this.tools.push(toolDef);
  }

  addResource(resourceDef: ResourceDef): void {
    this.resources.push(resourceDef);
  }

  addResourceTemplate(resourceDef: ResourceDef): void {
    this.resources.push(resourceDef);
  }

  on(eventName: string, handler: (event: unknown) => unknown): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  async emitTest(eventName: string, event: unknown): Promise<void> {
    for (const handler of this.handlers.get(eventName) ?? []) {
      await handler(event);
    }
  }
}

await jest.unstable_mockModule('fastmcp', () => ({
  FastMCP: MockFastMCP,
}));

await jest.unstable_mockModule('../tools/index', () => ({
  default: (server: MockFastMCP) => {
    server.addTool({
      name: 'builtin_tool',
      description: 'Built-in test tool',
      parameters: {},
      execute: async () => ({
        content: [{ type: 'text', text: 'builtin result' }],
      }),
    });
    server.addTool({
      name: 'blocked_tool',
      description: 'Blocked test tool',
      parameters: {},
      execute: async () => ({
        content: [{ type: 'text', text: 'blocked result' }],
      }),
    });
  },
}));

await jest.unstable_mockModule('../resources/index', () => ({
  default: (server: MockFastMCP) => {
    server.addResource({
      uri: 'generate://code-with-locators',
      name: 'Generate Code With Locators',
      load: async () => ({
        text: 'allowed resource',
      }),
    });
    server.addResource({
      uri: 'device://state',
      name: 'Device State',
      load: async () => ({
        text: 'blocked resource',
      }),
    });
  },
}));

await jest.unstable_mockModule('../session-store', () => ({
  getDriver: jest.fn(() => null),
  getSessionId: jest.fn(() => null),
  getSessionInfo: jest.fn(() => null),
  listSessions: jest.fn(() => sessions),
  safeDeleteAllSessions,
}));

await jest.unstable_mockModule('../logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createAppiumMcpServer } = await import('../create-server.js');

afterEach(() => {
  registeredServers.length = 0;
  sessions = [];
  safeDeleteAllSessions.mockReset();
  delete process.env.APPIUM_MCP_ON_CLIENT_DISCONNECT;
});

describe('createAppiumMcpServer plugin lifecycle', () => {
  test('registers plugin capabilities during construction but initializes lazily', async () => {
    let registerCalled = false;
    let initialized = false;

    const plugin: AppiumMcpPlugin = {
      name: 'lazy-plugin',
      version: '1.0.0',
      register(_registry, core) {
        registerCalled = true;
        expect(core.getSessionId()).toBeNull();
      },
      async initialize() {
        initialized = true;
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;

    expect(registerCalled).toBe(true);
    expect(initialized).toBe(false);

    await server.emitTest('connect', { session: 'client-1' });

    expect(initialized).toBe(true);
  });

  test('wraps built-in tools with beforeCall and afterCall hooks', async () => {
    const calls: string[] = [];
    const plugin: AppiumMcpPlugin = {
      name: 'hook-plugin',
      version: '1.0.0',
      async beforeCall(ctx: ToolCallContext): Promise<void> {
        calls.push(`before:${ctx.toolName}`);
      },
      async afterCall(
        ctx: ToolCallContext,
        result: ToolCallResult
      ): Promise<ToolCallResult> {
        calls.push(`after:${ctx.toolName}`);
        return {
          ...result,
          content: [{ type: 'text', text: 'modified builtin result' }],
        };
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;
    const result = (await server.tools[0].execute({}, {})) as ToolCallResult;

    expect(calls).toEqual(['before:builtin_tool', 'after:builtin_tool']);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'modified builtin result',
    });
  });

  test('hides nonmatching built-in tools and resources from registration', () => {
    const server = createAppiumMcpServer({
      policy: {
        allowTools: [/^builtin_tool$/],
        allowResources: [/^Generate Code With Locators$/],
      },
    }) as unknown as MockFastMCP;

    expect(server.tools.map((tool) => tool.name)).toEqual(['builtin_tool']);
    expect(server.resources.map((resource) => resource.uri)).toEqual([
      'generate://code-with-locators',
    ]);
  });

  test('applies policy to plugin tools before registration', () => {
    const plugin: AppiumMcpPlugin = {
      name: 'policy-plugin',
      version: '1.0.0',
      register(registry) {
        registry.addTool(
          'plugin_allowed',
          'Allowed plugin tool',
          testToolParameters,
          async () => ({
            content: [{ type: 'text', text: 'allowed' }],
          })
        );
        registry.addTool(
          'plugin_blocked',
          'Blocked plugin tool',
          testToolParameters,
          async () => ({
            content: [{ type: 'text', text: 'blocked' }],
          })
        );
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
      policy: {
        allowTools: [/^plugin_allowed$/, /^builtin_tool$/],
      },
    }) as unknown as MockFastMCP;

    expect(server.tools.map((tool) => tool.name)).toEqual([
      'plugin_allowed',
      'builtin_tool',
    ]);
  });

  test('fails during construction when policy allowlists are invalid', () => {
    expect(() =>
      createAppiumMcpServer({
        policy: {
          allowTools: ['builtin_tool'] as unknown as RegExp[],
        },
      })
    ).toThrow('policy.allowTools must contain only RegExp values');
  });

  test('destroys plugins only after the last client disconnects', async () => {
    let initializeCount = 0;
    let destroyCount = 0;
    const plugin: AppiumMcpPlugin = {
      name: 'lifecycle-plugin',
      version: '1.0.0',
      async initialize() {
        initializeCount += 1;
      },
      async destroy() {
        destroyCount += 1;
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;

    await server.emitTest('connect', { session: 'client-1' });
    await server.emitTest('connect', { session: 'client-2' });
    await server.emitTest('disconnect', { session: 'client-1' });

    expect(initializeCount).toBe(1);
    expect(destroyCount).toBe(0);

    await server.emitTest('disconnect', { session: 'client-2' });

    expect(destroyCount).toBe(1);
  });

  test('initializes plugins once when clients connect concurrently', async () => {
    let initializeCount = 0;
    let resolveInitialize: (() => void) | undefined;
    let markInitializeStarted: (() => void) | undefined;
    const initializeStarted = new Promise<void>((resolve) => {
      markInitializeStarted = resolve;
    });
    const plugin: AppiumMcpPlugin = {
      name: 'concurrent-plugin',
      version: '1.0.0',
      async initialize() {
        initializeCount += 1;
        markInitializeStarted?.();
        await new Promise<void>((resolve) => {
          resolveInitialize = resolve;
        });
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;

    const connectA = server.emitTest('connect', { session: 'client-1' });
    const connectB = server.emitTest('connect', { session: 'client-2' });

    await initializeStarted;
    expect(initializeCount).toBe(1);

    resolveInitialize?.();
    await Promise.all([connectA, connectB]);
    expect(initializeCount).toBe(1);
  });

  test('re-initializes only after an in-flight destroy finishes', async () => {
    const calls: string[] = [];
    let resolveDestroy: (() => void) | undefined;
    const plugin: AppiumMcpPlugin = {
      name: 'destroy-race-plugin',
      version: '1.0.0',
      async initialize() {
        calls.push('initialize');
      },
      async destroy() {
        calls.push('destroy-start');
        await new Promise<void>((resolve) => {
          resolveDestroy = resolve;
        });
        calls.push('destroy-end');
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;

    await server.emitTest('connect', { session: 'client-1' });
    const disconnect = server.emitTest('disconnect', { session: 'client-1' });
    await Promise.resolve();
    const reconnect = server.emitTest('connect', { session: 'client-2' });

    expect(calls).toEqual(['initialize', 'destroy-start']);

    resolveDestroy?.();
    await Promise.all([disconnect, reconnect]);

    expect(calls).toEqual([
      'initialize',
      'destroy-start',
      'destroy-end',
      'initialize',
    ]);
  });

  test('destroys plugins after final disconnect during pending initialization', async () => {
    let initializeCount = 0;
    let destroyCount = 0;
    let resolveInitialize: (() => void) | undefined;
    const plugin: AppiumMcpPlugin = {
      name: 'pending-init-plugin',
      version: '1.0.0',
      async initialize() {
        initializeCount += 1;
        await new Promise<void>((resolve) => {
          resolveInitialize = resolve;
        });
      },
      async destroy() {
        destroyCount += 1;
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;

    const connect = server.emitTest('connect', { session: 'client-1' });
    await Promise.resolve();
    const disconnect = server.emitTest('disconnect', { session: 'client-1' });

    expect(initializeCount).toBe(1);
    expect(destroyCount).toBe(0);

    resolveInitialize?.();
    await Promise.all([connect, disconnect]);

    expect(destroyCount).toBe(1);
  });

  test('destroys plugins on final disconnect when session cleanup policy is skip', async () => {
    process.env.APPIUM_MCP_ON_CLIENT_DISCONNECT = 'skip';
    sessions = [{ sessionId: 'session-1', isActive: true, ownership: 'owned' }];
    let destroyCount = 0;
    const plugin: AppiumMcpPlugin = {
      name: 'skip-policy-plugin',
      version: '1.0.0',
      async initialize() {},
      async destroy() {
        destroyCount += 1;
      },
    };

    const server = createAppiumMcpServer({
      plugins: [plugin],
    }) as unknown as MockFastMCP;

    await server.emitTest('connect', { session: 'client-1' });
    await server.emitTest('disconnect', { session: 'client-1' });

    expect(safeDeleteAllSessions).not.toHaveBeenCalled();
    expect(destroyCount).toBe(1);
  });
});
