import { describe, expect, jest, test } from '@jest/globals';

function mockToolErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

jest.unstable_mockModule('../../tools/tool-response', () => ({
  errorResult: jest.fn((text: string) => ({
    content: [{ type: 'text', text }],
    isError: true,
  })),
  noActiveDriverSessionMessage: jest.fn(),
  readWebElementId: jest.fn(),
  resolveDriver: jest.fn(),
  textResult: jest.fn(),
  textResultWithPrimaryElementId: jest.fn(),
  toolErrorMessage: jest.fn(mockToolErrorMessage),
}));

jest.unstable_mockModule('../../command', () => ({
  execute: jest.fn(),
  findElement: jest.fn(),
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
    expect(strategyDescription).toMatch(/iOS.*prefer.*predicate.*class chain/i);
    expect(strategyDescription).toMatch(
      /Android.*prefer.*android uiautomator/i
    );
    expect(strategyDescription).toMatch(/xpath last/i);
    expect(selectorDescription).toMatch(/not natural language/i);
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
    expect(actionDescription).toMatch(/prepare_ios_simulator.*before create/i);
    expect(actionDescription).toMatch(/REMOTE SERVER MODE/i);
    expect(actionDescription).toMatch(
      /only when the user explicitly provides/i
    );
    expect(actionDescription).toMatch(/without taking ownership/i);
    expect(actionDescription).toMatch(
      /without deleting the real remote session/i
    );

    expect(platformDescription).toMatch(/Required for create/i);
    expect(platformDescription).toMatch(/general.*other remote drivers/i);
    expect(remoteServerUrlDescription).toMatch(/omit for embedded create/i);
    expect(sessionIdDescription).toMatch(/required for attach\/select/i);
    expect(tool.annotations?.destructiveHint).toBe(true);
  });

  test('appium_mobile_permissions retains action-specific requirements', async () => {
    const tool = await registerTool(
      '../../tools/app-management/permissions.js'
    );

    expect(normalizeText(paramDescription(tool, 'action'))).toMatch(
      /get.*Android.*iOS.*update.*Android.*iOS.*reset.*iOS/i
    );
    expect(normalizeText(paramDescription(tool, 'service'))).toMatch(
      /Required.*iOS get\/reset.*service name.*numeric/i
    );
    expect(normalizeText(paramDescription(tool, 'permissions'))).toMatch(
      /Required.*Android update/i
    );
    expect(normalizeText(paramDescription(tool, 'access'))).toMatch(
      /Required.*iOS update.*yes.*no.*unset.*limited/i
    );
  });

  test('appium_mobile_file retains platform-specific path syntax', async () => {
    const tool = await registerTool('../../tools/session/file-transfer.js');
    const pathDescription = normalizeText(paramDescription(tool, 'remotePath'));

    expect(pathDescription).toMatch(/Android.*absolute path/i);
    expect(pathDescription).toMatch(/\/sdcard\/Download/i);
    expect(pathDescription).toMatch(/@com\.example\.app:documents/i);
    expect(normalizeText(paramDescription(tool, 'payloadBase64'))).toMatch(
      /required.*push/i
    );
  });

  test('appium_mobile_press_key maps logical keys by platform', async () => {
    const tool = await registerTool('../../tools/interactions/press-key.js');
    const keyDescription = normalizeText(paramDescription(tool, 'key'));

    expect(keyDescription).toMatch(/Android.*BACK.*HOME.*APP_SWITCH/i);
    expect(keyDescription).toMatch(/iOS\/tvOS.*VOLUME_UP.*PLAY_PAUSE.*SELECT/i);
  });

  test('appium_gesture retains scroll direction defaults', async () => {
    const { gestureSchema } = await import('../../tools/gestures/schema.js');
    const directionDescription = normalizeText(
      gestureSchema.shape.direction.description ?? ''
    );

    expect(directionDescription).toMatch(
      /scroll_to_element.*up\/down.*default down/i
    );
  });
});
