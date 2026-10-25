# Plugins and Extensions

MCP Appium supports custom server plugins via the `appium-mcp/core` Plugin API (`--plugin` CLI flag or programmatic composition) as well as optional extensions such as `@appium/mcp-documentation` and `appium_ai`.

## Table of Contents

- [Plugin API](#plugin-api)
  - [Load plugins from the command line](#load-plugins-from-the-command-line)
  - [Compose a server programmatically](#compose-a-server-programmatically)
  - [Stdio logging](#stdio-logging)
  - [Safe plugin surface](#safe-plugin-surface)
  - [Verify plugin and tool names](#verify-plugin-and-tool-names)
- [Optional Extensions](#optional-extensions)
  - [Documentation Tools (`@appium/mcp-documentation`)](#documentation-tools-opt-in)
  - [AI Vision Element Finding (`appium_ai`)](#ai-vision-element-finding)

## Plugin API

### Load plugins from the command line

Pass `--plugin` to start the standard server with a plugin, without writing a server bootstrap module. Repeat the option to load multiple plugins in order; both `--plugin <module>` and `--plugin=<module>` work with stdio and `--httpStream`:

```bash
appium-mcp --plugin ./checkout-plugin.mjs --plugin=@acme/appium-mcp-plugin
```

Each module must **default-export** either an `AppiumMcpPlugin` object or a plugin class whose constructor takes no arguments. For example, save this as `checkout-plugin.mjs`:

```javascript
export default class CheckoutPlugin {
  name = 'checkout-plugin';
  version = '1.0.0';

  register(registry) {
    registry.addTool({
      name: 'checkout_status',
      description: 'Return the checkout integration status.',
      execute: async () => ({content: [{type: 'text', text: 'Checkout plugin ready'}]}),
    });
  }
}
```

Use an exported object (for example, `export default new CheckoutPlugin(options)`) when a plugin needs constructor options. TypeScript plugins must be compiled to JavaScript before loading.

Relative paths and installed package names resolve from the working directory where `appium-mcp` is launched. Package names use Node's CommonJS resolution (`createRequire(...).resolve()`), including `require` or `default` export conditions and legacy `main` entries. Packages exposing only an `import` export must be loaded through an explicit file path (for example, `--plugin ./node_modules/my-plugin/plugin.mjs`) or a `file:` URL. Loading still uses dynamic `import()`, so ESM plugin files, including those with top-level `await`, remain supported.

Absolute paths and `file:` URLs are also accepted; absolute paths are recommended in MCP client configurations because the client's working directory can vary. The CLI does not install packages: install package plugins in that working directory first.

Plugins execute in the server process, so load only trusted files and packages and keep plugin logs on stderr when using stdio. A missing module or invalid plugin export stops startup with an error instead of silently omitting the plugin. The optional documentation plugin, when enabled, is registered before CLI plugins. The existing duplicate-name and lifecycle rules below apply.

### Compose a server programmatically

Use `appium-mcp/core` to compose the default Appium MCP server with custom business logic without maintaining a fork. Plugins can register MCP tools, prompts, resources, and resource templates, and can wrap tool execution with lifecycle hooks. Call hooks are tool-only: prompts, resources, and resource templates are registered with FastMCP but are not wrapped by `beforeCall` or `afterCall`.

`createAppiumMcpServer({ policy })` can also hide nonmatching tools and resources from MCP discovery. The factory is async, so await it before starting the returned server. Policy rules are regular expressions matched against tool and resource names exactly as registered. The policy is applied at registration time to both single and batch registration methods. Resource policy matches the resource `name` only; resources or resource templates without a string `name` cannot match a non-empty `allowResources` list.

```ts
import {createAppiumMcpServer} from 'appium-mcp/core';
import type {AppiumMcpPlugin, McpRegistry, ToolCallContext} from 'appium-mcp/core';
import {z} from 'zod';

class CheckoutPlugin implements AppiumMcpPlugin {
  readonly name = 'checkout-plugin';
  readonly version = '1.0.0';

  register(registry: McpRegistry): void {
    const parameters = z.object({orderId: z.string()});
    registry.addTool({
      name: 'assert_checkout_summary',
      description: 'Assert that the checkout summary screen shows an expected order ID.',
      parameters,
      execute: async (args) => {
        const {orderId} = parameters.parse(args);
        return {
          content: [{type: 'text', text: `Assert checkout order ${orderId}`}],
        };
      },
    });
  }

  async beforeCall(ctx: ToolCallContext): Promise<void> {
    if (ctx.toolName === 'appium_gesture') {
      console.error(`[checkout-plugin] about to call ${ctx.toolName}`);
    }
  }
}

const server = await createAppiumMcpServer({
  plugins: [new CheckoutPlugin()],
  additionalInstructions: 'Custom checkout policies are active.',
  policy: {
    allowTools: [/^appium_session_management$/, /^assert_checkout_summary$/],
    allowResources: [/^Generate Code With Locators$/],
  },
});

await server.start({transportType: 'stdio'});
```

### Stdio logging

`start({ transportType: 'stdio' })` automatically configures Appium and WebDriver logging before the stdio transport starts, keeping stdout reserved for JSON-RPC. You normally do not need to configure logging separately.

In stdio mode, `WDIO_LOG_LEVEL` values that would write verbose output to stdout (`trace`, `debug`, and `info`) are clamped to `warn`. Quieter `error` and `silent` values are preserved. This behavior only applies to stdio; `httpStream` logging is unchanged.

For advanced integrations that need to configure logging explicitly, `configureStdioTransportLogging()` is exported from `appium-mcp/core`. Call it before starting stdio work; calling `server.start({ transportType: 'stdio' })` already invokes it automatically.

Plugin lifecycle:

- `register(registry, core)`: called during server construction. Register custom tools, prompts, resources, and resource templates here.
- `initialize(ctx)`: called lazily on the first MCP client connection. Use it for async setup such as artifact storage or internal service clients.
- `beforeCall(ctx)`: called before a registered MCP tool executes. Return a `ToolCallResult` to short-circuit the tool. This hook only applies to tools, not prompts, resources, or resource templates.
- `afterCall(ctx, result)`: called after a registered MCP tool executes. Return a modified `ToolCallResult` to decorate or replace the response. This hook only applies to tools, not prompts, resources, or resource templates.
- `destroy()`: called after the last MCP client disconnects.

### Safe plugin surface

The supported plugin API is intentionally small:

| Surface                   | Safe methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `McpRegistry`             | [`addTool`](https://github.com/punkpeye/fastmcp#tools), [`addTools`](https://github.com/punkpeye/fastmcp#tools), [`addPrompt`](https://github.com/punkpeye/fastmcp#prompts), [`addPrompts`](https://github.com/punkpeye/fastmcp#prompts), [`addResource`](https://github.com/punkpeye/fastmcp#resources), [`addResources`](https://github.com/punkpeye/fastmcp#resources), [`addResourceTemplate`](https://github.com/punkpeye/fastmcp#resource-templates), [`addResourceTemplates`](https://github.com/punkpeye/fastmcp#resource-templates) |
| `AppiumMcpCore`           | `getSessionId()`, `getSessionInfo(sessionId?)`, `getDriver(sessionId?)`, `listSessions()`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ToolCallContext.session` | `getSessionId()`, `getSessionInfo(sessionId?)`, `getDriver(sessionId?)`, `listSessions()`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `PluginContext`           | `core`, `plugins`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

`McpRegistry` methods delegate to the matching FastMCP registration APIs, so their object shapes follow FastMCP's documented tool, prompt, resource, and resource-template definitions. Appium MCP wraps registered tools with plugin call hooks, but prompts and resources are registered directly with FastMCP.

Each plugin name should be unique within the server. If two plugins use the same `name`, Appium MCP keeps the first plugin registered for that name and skips later plugins with a warning. Use a stable, package-style or organization-prefixed name, such as `acme-checkout-plugin`, to avoid collisions when composing plugins from multiple teams.

Each tool name should also be unique across all plugins and the core server. Tool names follow FastMCP behavior, not plugin-name behavior: when a tool is registered with the same `name` as an existing tool, FastMCP replaces the earlier tool definition with the later one. Appium MCP registers built-in tools before plugin tools, which means a plugin tool that uses the same name as a built-in tool replaces the built-in tool. Appium MCP tools usually have an `appium_` prefix, so plugin tool names should use that pattern only when they intentionally override a core tool.

### Verify plugin and tool names

Use `verifyAppiumMcpNames` before publishing or deploying a custom plugin setup. It registers your plugin capabilities into a lightweight collector, registers the Appium MCP core tools, and reports duplicate plugin names, duplicate tool names, and registration errors without starting the MCP server.

The recommended approach is to verify the same plugin array you pass to `createAppiumMcpServer({ plugins })`. This preserves your real plugin instances and order:

```ts
import {formatVerificationReport, verifyAppiumMcpNames} from 'appium-mcp/core';
import {plugins} from './plugins.js';

const report = verifyAppiumMcpNames({plugins});

console.log(formatVerificationReport(report));
process.exit(report.ok ? 0 : 1);
```

When you provide multiple plugins, order is preserved. Plugins are verified in array order after the `appium-mcp core` tools. This matters because Appium MCP keeps the first plugin for a duplicate plugin name and skips later plugins with the same name, while duplicate tool names follow FastMCP's later-registration-wins behavior. Tool names still need to be unique across all loaded plugins and `appium-mcp core`; the verifier reports any collisions it finds.

The report labels this package's own shipped tools as `appium-mcp core`. Plugin sources are labeled as `plugin:<name>` with the plugin version.

Treat anything outside `appium-mcp/core` as internal. In particular, plugins should not rely on private server internals, internal session-store modules, tool implementation files, or the raw FastMCP server instance. If a plugin needs another stable primitive, open an issue so it can be added to `AppiumMcpCore` or `McpRegistry` deliberately.

See [../examples/plugin-example.ts](../examples/plugin-example.ts) for a fuller cookbook with tools, prompts, resources, resource templates, call hooks, and lifecycle setup.

## Optional Extensions

### Documentation Tools (opt-in)

The documentation tools — `appium_documentation_query` (RAG search over the Appium docs) and `appium_skills` — live in a separate package, `@appium/mcp-documentation`, that carries a multi-megabyte embeddings cache and pulls in a heavy ML stack (`@xenova/transformers`, `@langchain/*`). To keep the default install lean, **this package is not a runtime dependency of appium-mcp and is never downloaded unless you opt in.** It is declared as an _optional peer dependency_.

Enabling the tools is a two-step opt-in:

**1. Install the optional package** (in the same project/environment as appium-mcp):

```bash
npm install @appium/mcp-documentation
```

Installing it with your own package manager dedupes against appium-mcp's existing dependencies, so only the genuinely new code is added.

**2. Set `APPIUM_MCP_DOCS_ENABLED`** in your MCP server config:

```json
{
  "appium-mcp": {
    "env": {
      "APPIUM_MCP_DOCS_ENABLED": "true",
      "ANDROID_HOME": "/path/to/android/sdk"
    }
  }
}
```

Behavior:

- **Unset / not truthy (default):** the documentation tools are **not registered**, and nothing related to them (cache, embeddings, ML dependencies) is loaded.
- **Truthy (`true`/`1`/`yes`/`on`):** the server registers the documentation tools if `@appium/mcp-documentation` is installed. If the flag is set but the package is **not** installed, the server starts normally **without** the documentation tools and logs a hint to run `npm install @appium/mcp-documentation`.

The gate is governed by the env var, not by mere presence of the package: with `APPIUM_MCP_DOCS_ENABLED` unset, the tools stay hidden even if the package happens to be installed.

Pre-installing it that way also avoids the first-run download delay.

### AI Vision Element Finding

Configure AI-powered element finding using vision models. When enabled, a separate tool — **`appium_ai`** — is registered alongside `appium_find_element`. It exposes `action=find_element`, which locates UI elements from natural-language descriptions and returns a coordinate UUID (`ai-element:x,y:bbox`) that can be passed to `appium_gesture` (`tap` / `double_tap` / `long_press`).

**This feature is opt-in.** When `AI_VISION_ENABLED` is unset or `false`, the `appium_ai` tool is **not registered** and the LLM has no way to invoke vision-based finding — keeping `appium_find_element` purely traditional.

See [AI_ELEMENT_FINDING_DESIGN.md](AI_ELEMENT_FINDING_DESIGN.md) and [AI_VISION_E2E_GUIDE_EN.md](AI_VISION_E2E_GUIDE_EN.md) for architecture and end-to-end setup details.
