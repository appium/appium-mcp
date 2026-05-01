import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { textResult } from '../tool-response.js';

const generateTestSchema = z.object({
  steps: z.array(z.string()).describe('The steps of the test'),
});

export default function generateTest(server: FastMCP): void {
  const instructions = (params: { steps: string[] }) =>
    [
      `## Instructions`,
      `- You are an Appium test generator.`,
      `- You are given a scenario and you need to generate an Appium test for it.`,
      ``,
      `### Ordered workflow (use these exact MCP tool names)`,
      `1. select_device — choose platform/device (local/embedded mode). Skip if the user already connected to a remote Appium URL (then use appium_session_management only).`,
      `2. prepare_ios_simulator or appium_prepare_ios_real_device — only when iOS local setup requires it; otherwise skip.`,
      `3. appium_session_management with action=create — start a driver session (match platform to select_device unless using remote server mode).`,
      `4. appium_app_lifecycle or other session tools as needed (e.g. activate app, deep link) — only if the scenario requires it.`,
      `5. Discover the target element — prefer appium_get_active_element when the focused field is enough; otherwise appium_find_element (strategy + selector, or ai_instruction when appropriate). Use generate_locators only for broad inspection/debugging, not for every step.`,
      `6. Interact using the same tool names the server exposes, for example:`,
      `   - appium_gesture with action=tap (or double_tap, long_press, scroll, swipe, scroll_to_element, pinch_zoom) — use the element id from appium_find_element when required`,
      `   - appium_set_value — type into an element; optionally appium_mobile_press_key for special keys`,
      `   - appium_get_text / appium_get_element_attribute when assertions need visible state`,
      `- After appium_find_element, the first line of the response is elementId:<uuid> (or an ai-element coordinate token). Pass that value as elementUUID to gestures or appium_set_value as documented in each tool.`,
      ``,
      `- Use generate_locators to fetch interactable elements when you need full-screen locator lists for code generation; pairing with generate://code-with-locators is fine for templates.`,
      `- An element can only be clicked if it is clickable.`,
      `- Text can only be entered into an element if it is focusable (or use appium_set_value with w3cActions when typing into the focused element).`,
      `- If an interaction fails, retry with a different possible locator in the hierarchy.`,
      `- Interact with the app using the tools provided, then generate the test.`,
      `- DO NOT generate test code from the scenario alone. DO run steps one by one with the tools listed above.`,
      `- Only after all steps are completed, emit an Appium/WebdriverIO-style test based on the message history.`,
      `- Save the generated test file in the tests directory.`,
      `- Use the generate://code-with-locators resource as reference for code generation.`,
      `- Always call appium_find_element (or appium_get_active_element when sufficient) to obtain elementId before tapping or setting value on a specific element.`,
      `Steps:`,
      ...params.steps.map((step, index) => `- ${index + 1}. ${step}`),
    ].join('\n');

  server.addTool({
    name: 'appium_generate_tests',
    description:
      'Generate tests for a mobile app: follow the returned instructions to drive the real session with MCP tools (select_device, appium_session_management, appium_find_element, appium_gesture, appium_set_value, etc.), then emit code. Use generate_locators only when you need a full locator snapshot; prefer appium_find_element for normal steps.',
    parameters: generateTestSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof generateTestSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> =>
      textResult(instructions({ steps: args.steps })),
  });
}
