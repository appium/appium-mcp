import {afterEach, describe, expect, test} from '@jest/globals';

import {
  clientSupportsMcpApps,
  isMcpAppsEnabled,
  MCP_APPS_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  supportsMcpAppsCapability,
} from '../ui/mcp-apps.js';
import {createPageSourceInspectorAppUI} from '../ui/page-source-inspector-app.js';

describe('MCP Apps feature flag', () => {
  const originalMcpAppsEnabled = process.env.APPIUM_MCP_APPS_ENABLED;
  const originalNoUI = process.env.NO_UI;

  afterEach(() => {
    restoreEnv('APPIUM_MCP_APPS_ENABLED', originalMcpAppsEnabled);
    restoreEnv('NO_UI', originalNoUI);
  });

  test('is enabled by default', () => {
    delete process.env.APPIUM_MCP_APPS_ENABLED;
    delete process.env.NO_UI;

    expect(isMcpAppsEnabled()).toBe(true);
  });

  test.each(['false', '0'])('is disabled by APPIUM_MCP_APPS_ENABLED=%s', (value) => {
    process.env.APPIUM_MCP_APPS_ENABLED = value;
    delete process.env.NO_UI;

    expect(isMcpAppsEnabled()).toBe(false);
  });

  test.each(['true', '1'])('is disabled when NO_UI=%s', (value) => {
    process.env.APPIUM_MCP_APPS_ENABLED = 'true';
    process.env.NO_UI = value;

    expect(isMcpAppsEnabled()).toBe(false);
  });
});

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
    ' text/html;profile=mcp-app ',
    'text/html; profile=mcp-app',
    'text/html; profile="mcp-app"',
    'TEXT/HTML; PROFILE="MCP-APP"',
  ])('normalizes the advertised MIME type %s', (mimeType) => {
    const capabilities = {
      extensions: {
        [MCP_APPS_EXTENSION_ID]: {
          mimeTypes: [mimeType],
        },
      },
    };

    expect(supportsMcpAppsCapability(capabilities)).toBe(true);
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

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
