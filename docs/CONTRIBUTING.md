# Contributing to MCP Appium

Welcome! This guide will help you extend MCP Appium by adding new tools and resources.

## Table of Contents

- [Adding New Tools](#adding-new-tools)
- [Adding New Resources](#adding-new-resources)
- [Code Style Guidelines](#code-style-guidelines)
- [Formatting Best Practices](#formatting-best-practices)
- [Tool Metadata with YAML](#tool-metadata-with-yaml)
- [Code Style Guidelines](#code-style-guidelines)
- [Formatting Best Practices](#formatting-best-practices)

---

## Adding New Tools

Tools are the core capabilities of MCP Appium. They define actions that can be performed on mobile devices.

### Quick Start: Simple Tool

Here's a minimal example of adding a new tool:

```typescript
// src/tools/my-new-tool.ts
import { FastMCP } from 'fastmcp/dist/FastMCP.js';
import { z } from 'zod';
import { getDriver } from './session-store.js';

export default function myNewTool(server: FastMCP): void {
  server.addTool({
    name: 'appium_my_new_tool',
    description: 'Description of what this tool does',
    parameters: z.object({
      param1: z.string().describe('Description of param1'),
      param2: z.number().optional().describe('Description of param2'),
    }),
    annotations: {
      readOnlyHint: false, // Set to true if tool only reads data
      openWorldHint: false, // Set to true if tool requires real-world knowledge
    },
    execute: async (args: any, context: any): Promise<any> => {
      const driver = getDriver();
      if (!driver) {
        throw new Error(
          'No active driver session. Please create a session first.'
        );
      }

      // Your tool logic here
      const result = await driver.someMethod(args.param1);

      return {
        content: [
          {
            type: 'text',
            text: `Success message: ${result}`,
          },
        ],
      };
    },
  });
}
```

### Registering the Tool

Add your tool to `src/tools/index.ts`:

```typescript
import myNewTool from './my-new-tool.js';

export default function registerTools(server: FastMCP): void {
  // ... existing code ...

  myNewTool(server); // Add this line

  // ... rest of the tools ...
}
```

### Tool Parameters

Use Zod schemas to define parameters:

```typescript
import { z } from 'zod';

parameters: z.object({
  // Required string parameter
  requiredString: z.string().describe('A required string parameter'),

  // Optional number parameter
  optionalNumber: z.number().optional().describe('An optional number'),

  // Enum parameter
  platform: z.enum(['ios', 'android']).describe('Target platform'),

  // Object parameter
  config: z
    .object({
      key: z.string(),
      value: z.string(),
    })
    .optional()
    .describe('Configuration object'),

  // Array parameter
  items: z.array(z.string()).describe('List of items'),
});
```

### Tool Annotations

Annotations help the AI understand when to use your tool:

- `readOnlyHint: true` - Use when the tool only retrieves/reads data without modifying state
- `readOnlyHint: false` - Use when the tool performs actions or modifications
- `openWorldHint: true` - Use when the tool requires knowledge beyond the codebase
- `openWorldHint: false` - Use for codebase-specific operations

### Common Patterns

#### 1. Session Management Tools

```typescript
import {
  getDriver,
  hasActiveSession,
  safeDeleteSession,
} from './session-store.js';

// Check for active session
if (!hasActiveSession()) {
  throw new Error('No active session. Please create a session first.');
}

const driver = getDriver();
// Use driver...
```

#### 2. Platform-Specific Tools

```typescript
import { getPlatformName } from './session-store.js';

const platform = getPlatformName(driver);
if (platform === 'Android') {
  // Android-specific implementation
} else if (platform === 'iOS') {
  // iOS-specific implementation
}
```

---

## Adding New Resources

Resources provide contextual information to help the AI assist users better.

### Creating a Resource

```typescript
// src/resources/my-resource.ts
export default function myResource(server: any): void {
  server.addResource({
    uri: 'my://resource-uri',
    name: 'My Resource Name',
    description: 'Description of what this resource provides',
    mimeType: 'text/plain', // or 'application/json', 'text/markdown', etc.
    async load() {
      // Return the resource content
      return {
        text: 'Resource content here',
        // or
        // data: someJSONData,
      };
    },
  });
}
```

### Registering a Resource

Add your resource to `src/resources/index.ts`:

```typescript
import myResource from './my-resource.js';

export default function registerResources(server: any) {
  myResource(server); // Add this line
  console.log('All resources registered');
}
```

### Resource Types

#### Text Resource

```typescript
{
  uri: 'doc://example',
  name: 'Example Resource',
  mimeType: 'text/plain',
  async load() {
    return { text: 'Simple text content' };
  }
}
```

#### JSON Resource

```typescript
{
  uri: 'data://example',
  name: 'Example Data',
  mimeType: 'application/json',
  async load() {
    return { data: { key: 'value' } };
  }
}
```

#### Markdown Resource

```typescript
{
  uri: 'doc://guide',
  name: 'Guide',
  mimeType: 'text/markdown',
  async load() {
    return { text: '# Markdown Content' };
  }
}
```

---

## Code Style Guidelines

### 1. File Naming

- Tools: `kebab-case.ts` (e.g., `boot-simulator.ts`)
- Resources: `kebab-case.ts` (e.g., `java-template.ts`)

### 2. Function Exports

Always export as default function:

```typescript
export default function myTool(server: FastMCP): void {
  // implementation
}
```

### 3. Error Handling

Always provide helpful error messages:

```typescript
if (!driver) {
  throw new Error('No active driver session. Please create a session first.');
}
```

### 4. Return Values

Always return content in the expected format:

```typescript
return {
  content: [
    {
      type: 'text',
      text: 'Success message or data',
    },
  ],
};
```

### 5. Async/Await

Always use async/await for async operations:

```typescript
// Good
const result = await driver.someMethod();

// Bad
driver.someMethod().then(result => ...)
```

### 6. Type Safety

Use proper TypeScript types:

```typescript
execute: async (args: any, context: any): Promise<any> => {
  // Type your variables
  const driver = getDriver();
  if (!driver) {
    throw new Error('No driver');
  }
  // ...
};
```

---

## Examples

See these existing tools for reference:

- **Simple tool**: `src/tools/scroll.ts` - Basic scrolling functionality
- **Complex tool**: `src/tools/create-session.ts` - Session management with multiple capabilities
- **Interaction tool**: `src/tools/interactions/click.ts` - Element interaction
- **Prompt-based tool**: `src/tools/generate-tests.ts` - AI instructions

---

## Testing

After adding a new tool:

1. Build the project: `npm run build`
2. Run linter: `npm run lint`
3. Test the tool with an MCP client
4. Verify the tool appears in the tools list

---

## Pre-Release Checklist

Before releasing a new version, ensure documentation submodules are up to date:

### Updating Documentation Submodules

This project uses Git submodules to automatically sync documentation from the official Appium repositories. Before each release, you must update the submodules to ensure you have the latest documentation files (.md and image files).

**Required steps before each release:**

1. **Update all submodules to latest commits:**

   ```bash
   ./scripts/update-submodules.sh
   ```

   This script will:

   - Update all Git submodules to their latest commits
   - Reapply sparse-checkout to only fetch `.md` and image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`)
   - Ensure you have the latest documentation without downloading entire repositories

2. **Re-index the documentation (if needed):**

   ```bash
   npm run build
   npm run index-docs
   ```

3. **Commit the updated submodule references:**
   ```bash
   git add .gitmodules src/resources/submodules
   git commit -m "chore: update documentation submodules"
   ```

### Why This Is Important

- **Fresh Documentation**: Ensures RAG indexing uses the latest Appium documentation
- **Smaller Repository**: Sparse-checkout keeps repository size manageable by only fetching documentation files
- **Automatic Sync**: Submodules automatically track upstream repository commits
- **Reproducibility**: Submodule commits are tracked, ensuring consistent documentation across environments

See [SUBMODULES.md](../docs/SUBMODULES.md) for detailed information about submodule setup and usage.

---

---

## Formatting Best Practices

### Long Descriptions

For better readability when descriptions are long, use template literals with proper indentation:

**Bad (hard to read):**

```typescript
description: 'REQUIRED: First ASK THE USER which mobile platform they want to use (Android or iOS) before creating a session. If a non-Android/iOS name is provided, it will be treated as "general" and capabilities will be used as-is or merged from CAPABILITIES_CONFIG.',
```

**Good (readable):**

```typescript
description: `REQUIRED: First ASK THE USER which mobile platform they want to use (Android or iOS) before creating a session.
  DO NOT assume or default to any platform.
  You MUST explicitly prompt the user to choose between Android or iOS for local servers.
  If the user provides any other name, it will be treated internally as "general": capabilities are used as-is or merged from CAPABILITIES_CONFIG.
  This is mandatory before proceeding to use the create_session tool.
  `,
```

### Parameter Descriptions

For long parameter descriptions, also use template literals:

```typescript
parameters: z.object({
  platform: z.enum(['ios', 'android', 'general']).describe(
    `REQUIRED: Must match the platform the user explicitly selected via the select_platform tool.
      If a non-Android/iOS name is provided, it will be treated as "general" and the session will use provided capabilities or those from CAPABILITIES_CONFIG.general.`
  ),
});
```

---

## Need Help?

- Check existing tools in `src/tools/`
- See examples in `examples/`
- Open an issue for questions

Happy contributing! 🎉
