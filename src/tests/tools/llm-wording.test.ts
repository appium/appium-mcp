import { describe, expect, jest, test } from '@jest/globals';

function mockToolErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

jest.unstable_mockModule('../../tools/tool-response', () => ({
  errorResult: jest.fn((text: string) => ({
    content: [{ type: 'text', text }],
    isError: true,
  })),
  readWebElementId: jest.fn(),
  resolveDriver: jest.fn(),
  textResultWithPrimaryElementId: jest.fn(),
  toolErrorMessage: jest.fn(mockToolErrorMessage),
}));

jest.unstable_mockModule('../../tools/session/attach-session', () => ({
  attachSessionAction: jest.fn(),
}));

jest.unstable_mockModule('../../tools/session/create-session', () => ({
  createSessionAction: jest.fn(),
  DRIVER_MODE_PLATFORMS: ['ios', 'android', 'general'],
}));

jest.unstable_mockModule('../../tools/session/delete-session', () => ({
  deleteSessionAction: jest.fn(),
}));

jest.unstable_mockModule('../../tools/session/detach-session', () => ({
  detachSessionAction: jest.fn(),
}));

jest.unstable_mockModule('../../tools/session/list-sessions', () => ({
  listSessionsAction: jest.fn(),
}));

jest.unstable_mockModule('../../tools/session/select-session', () => ({
  selectSessionAction: jest.fn(),
}));

type RegisteredTool = {
  name: string;
  description: string;
  parameters: {
    shape: Record<string, { description?: string }>;
  };
  annotations?: Record<string, unknown>;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function registerTool(modulePath: string): Promise<RegisteredTool> {
  const server = { addTool: jest.fn() };
  const { default: register } = await import(modulePath);

  register(server as any);

  return server.addTool.mock.calls.at(-1)?.[0] as RegisteredTool;
}

function paramDescription(tool: RegisteredTool, name: string): string {
  return tool.parameters.shape[name]?.description ?? '';
}

describe('LLM-facing MCP tool wording', () => {
  test('appium_find_element guides models away from brittle or wrong find modes', async () => {
    const tool = await registerTool('../../tools/interactions/find.js');
    const description = normalizeText(tool.description);
    const strategyDescription = normalizeText(
      paramDescription(tool, 'strategy')
    );
    const selectorDescription = normalizeText(
      paramDescription(tool, 'selector')
    );

    expect(tool.name).toBe('appium_find_element');
    expect(description).toMatch(/strategy and selector/i);
    expect(description).toMatch(/accessibility id .* id .* xpath/i);
    expect(description).toMatch(/xpath.*last resort/i);
    expect(description).toMatch(/appium_gesture.*scroll_to_element/i);
    expect(description).toMatch(/appium_ai.*find_element/i);

    expect(strategyDescription).toMatch(/cross-platform.*fastest.*stable/i);
    expect(strategyDescription).toMatch(/iOS prefer/i);
    expect(strategyDescription).toMatch(/Android prefer/i);
    expect(strategyDescription).toMatch(/xpath last/i);
    expect(selectorDescription).toMatch(
      /Do not pass natural-language descriptions/i
    );
  });

  test('appium_session_management explains local vs remote session creation', async () => {
    const tool = await registerTool('../../tools/session/session.js');
    const description = normalizeText(tool.description);
    const actionDescription = normalizeText(paramDescription(tool, 'action'));
    const platformDescription = normalizeText(
      paramDescription(tool, 'platform')
    );
    const remoteServerUrlDescription = normalizeText(
      paramDescription(tool, 'remoteServerUrl')
    );
    const sessionIdDescription = normalizeText(
      paramDescription(tool, 'sessionId')
    );

    expect(tool.name).toBe('appium_session_management');
    expect(description).toMatch(
      /create.*attach.*detach.*delete.*list.*select/i
    );

    expect(actionDescription).toMatch(/DEFAULT MODE/i);
    expect(actionDescription).toMatch(/no separate Appium process is needed/i);
    expect(actionDescription).toMatch(/select_device tool FIRST/i);
    expect(actionDescription).toMatch(/do NOT pass remoteServerUrl/i);
    expect(actionDescription).toMatch(/NEVER invent a localhost URL/i);
    expect(actionDescription).toMatch(/REMOTE SERVER MODE/i);
    expect(actionDescription).toMatch(/only when user explicitly provides/i);
    expect(actionDescription).toMatch(/without taking ownership/i);
    expect(actionDescription).toMatch(
      /without deleting the real remote session/i
    );

    expect(platformDescription).toMatch(/Required for create/i);
    expect(platformDescription).toMatch(/general.*non-Android\/iOS/i);
    expect(remoteServerUrlDescription).toMatch(/Omit to use local server/i);
    expect(sessionIdDescription).toMatch(/Required for attach and select/i);
    expect(tool.annotations?.destructiveHint).toBe(true);
  });
});
