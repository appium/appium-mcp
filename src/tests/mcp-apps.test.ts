import {describe, expect, test} from '@jest/globals';

import {
  clientSupportsMcpApps,
  MCP_APPS_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  supportsMcpAppsCapability,
} from '../ui/mcp-apps.js';
import {createPageSourceInspectorAppUI} from '../ui/page-source-inspector-app.js';

describe('MCP Apps capability detection', () => {
  const supportedCapabilities = {
    extensions: {
      [MCP_APPS_EXTENSION_ID]: {
        mimeTypes: [MCP_APP_MIME_TYPE],
      },
    },
  };

  test('accepts clients advertising the stable MCP Apps MIME type', () => {
    expect(supportsMcpAppsCapability(supportedCapabilities)).toBe(true);
  });

  test.each([
    undefined,
    {},
    {extensions: {}},
    {extensions: {[MCP_APPS_EXTENSION_ID]: {}}},
    {extensions: {[MCP_APPS_EXTENSION_ID]: {mimeTypes: ['text/html']}}},
  ])('rejects unsupported capabilities %#', (capabilities) => {
    expect(supportsMcpAppsCapability(capabilities)).toBe(false);
  });

  test('matches the HTTP session from the tool context', () => {
    const server = {
      sessions: [
        {sessionId: 'first', clientCapabilities: {}},
        {sessionId: 'second', clientCapabilities: supportedCapabilities},
      ],
    };

    expect(clientSupportsMcpApps(server as never, {sessionId: 'second'})).toBe(true);
    expect(clientSupportsMcpApps(server as never, {sessionId: 'missing'})).toBe(false);
  });

  test('uses the only session for transports without a session ID', () => {
    const server = {
      sessions: [{sessionId: undefined, clientCapabilities: supportedCapabilities}],
    };

    expect(clientSupportsMcpApps(server as never, undefined)).toBe(true);
  });
});

describe('page source inspector MCP App', () => {
  test('uses the tool result instead of embedding page source data', () => {
    const html = createPageSourceInspectorAppUI();

    expect(html).toContain("message.method === 'ui/notifications/tool-result'");
    expect(html).toContain("'ui/initialize'");
    expect(html).toContain("'ui/notifications/initialized'");
    expect(html).not.toContain('<hierarchy>');
  });

  test('contains valid JavaScript', () => {
    const html = createPageSourceInspectorAppUI();
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

    expect(script).toBeDefined();
    expect(() => Function(script ?? '')).not.toThrow();
  });
});
