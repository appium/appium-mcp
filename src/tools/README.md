# Tools Directory

This directory contains all MCP tools available in MCP Appium.

## Tool Categories

### Session Management (`session/`)

- `create-session.ts` - Create mobile automation sessions
- `delete-session.ts` - Clean up sessions
- `select-platform.ts` - Choose Android or iOS
- `select-device.ts` - Choose specific device

### iOS Setup (`ios/`)

- `boot-simulator.ts` - Boot iOS simulators
- `setup-wda.ts` - Setup WebDriverAgent
- `install-wda.ts` - Install WebDriverAgent

### Navigation (`navigations/`)

- `scroll.ts` - Scroll screens
- `scroll-to-element.ts` - Scroll until element found
- `swipe.ts` - Swipe screens in any direction or between custom coordinates

### Element Interactions (`interactions/`)

- `find.ts` - Find elements
- `click.ts` - Click elements
- `double-tap.ts` - Double tap elements
- `set-value.ts` - Enter text
- `get-text.ts` - Get element text
- `get-page-source.ts` - Get page source (XML) from current screen
- `screenshot.ts` - Capture screenshots

### App Management (`app-management/`)

- `activate-app.ts` - Activate apps
- `terminate-app.ts` - Terminate apps
- `install-app.ts` - Install apps
- `uninstall-app.ts` - Uninstall apps
- `list-apps.ts` - List installed apps

### Test Generation (`test-generation/`)

- `locators.ts` - Generate page locators
- `generate-tests.ts` - Generate test code from scenarios

### Documentation (`documentation/`)

- `answer-appium.ts` - Answer Appium questions using RAG

## Adding a New Tool

See [docs/CONTRIBUTING.md](../../docs/CONTRIBUTING.md) for detailed instructions.

Quick steps:

1. Create a new file in the appropriate subdirectory (e.g., `interactions/my-tool.ts`)
2. Define the tool following the template
3. Import and register it in `index.ts`
4. Test with `npm run build && npm start`

### Tool Template

```typescript
import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver } from '../../session-store.js';

export default function myTool(server: FastMCP): void {
  server.addTool({
    name: 'appium_my_tool',
    description: 'What this tool does',
    parameters: z.object({
      param: z.string().describe('Parameter description'),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('No active session');
      }

      // Implementation

      return {
        content: [
          {
            type: 'text',
            text: 'Success',
          },
        ],
      };
    },
  });
}
```

### Registering a Tool

Add to `src/tools/index.ts`:

```typescript
import myTool from './interactions/my-tool.js';

export default function registerTools(server: FastMCP): void {
  // ... existing tools ...
  myTool(server);
  // ...
}
```

## Best Practices

1. **Always check for active session**: Use `getDriver()` and check for null
2. **Provide helpful errors**: Give clear error messages
3. **Use proper types**: Leverage TypeScript and Zod for type safety
4. **Add logging**: Use the logger from `logger.js` for debugging. Import with: `import log from 'logger.js'`. Use `log.info()`, `log.error()`, `log.warn()` instead of `console.log/error/warn` to maintain JSON-RPC compatibility
5. **Handle errors**: Always wrap risky operations in try-catch
6. **Return proper format**: Always return content in expected MCP format

## Session Store

Tools interact with the session through `session-store.ts`:

```typescript
import {
  getDriver,
  hasActiveSession,
  safeDeleteSession,
} from '../../session-store.js';

// Check if session exists
if (!hasActiveSession()) {
  throw new Error('No active session');
}

// Get the driver
const driver = getDriver();

// Use the driver
await driver.someMethod();
```

## Common Patterns

### Platform-Specific Logic

```typescript
import { getPlatformName } from '../../session-store.js';

if (getPlatformName(driver) === 'Android') {
  // Android implementation
} else if (getPlatformName(driver) === 'iOS') {
  // iOS implementation
}
```

## Testing

After adding a new tool:

1. Build: `npm run build`
2. Run linter: `npm run lint`
3. Test with an MCP client
4. Verify tool appears in tools list

## Need Help?

- Check existing tools for examples
- Read [docs/CONTRIBUTING.md](../../docs/CONTRIBUTING.md)
- Look at examples in `examples/` directory
- Open an issue for questions
