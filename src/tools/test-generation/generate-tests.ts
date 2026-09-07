import type {ContentResult, FastMCP} from 'fastmcp';
import {z} from 'zod';

import {textResult} from '../tool-response.js';

const generateTestSchema = z.object({
  steps: z.array(z.string()).describe('The steps of the test'),
});

export default function generateTest(server: FastMCP): void {
  const instructions = (params: {steps: string[]}) =>
    [
      `## Instructions`,
      `- Generate an Appium test from the scenario after executing it on a real session.`,
      ``,
      `### Ordered workflow (use these exact MCP tool names)`,
      `1. If no session is ready: locally use select_device, then prepare_ios_simulator or appium_prepare_ios_real_device when needed. Create via appium_session_management action=create with the selected platform. For a user-provided remoteServerUrl, skip local setup and infer platform from context; never invent a URL.`,
      `2. Use appium_app_lifecycle to install, activate, or deep_link only as needed.`,
      `3. Get the target ID with appium_find_element (strategy + selector), or appium_get_active_element when the focused field suffices. Use appium_ai only if registered and no stable locator works.`,
      `4. Interact with appium_gesture (tap, double_tap, long_press, scroll, swipe, scroll_to_element, pinch_zoom), appium_drag_and_drop, appium_set_value, or appium_mobile_press_key. Read assertions with appium_get_text / appium_get_element_attribute.`,
      `- Find responses start with elementId '<value>'; pass the value as elementUUID where supported. ai-element IDs from appium_ai are coordinates, not WebDriver IDs; use them only with tools that support them.`,
      ``,
      `- Use generate_locators for broad inspection or full-screen code generation, not every step. Consult generate://code-with-locators for templates.`,
      `- An element can only be clicked if it is clickable.`,
      `- Text can only be entered into an element if it is focusable (or use appium_set_value with w3cActions when typing into the focused element).`,
      `- If an interaction fails, retry with a more stable locator or appium_gesture with action=scroll_to_element.`,
      `- Execute all steps in order before emitting an Appium/WebdriverIO-style test based on the observed interactions; never generate from the scenario alone.`,
      `- Prefer explicit waits (waitForDisplayed, waitForExist, or equivalent) in generated code over fixed sleep or Thread.sleep.`,
      `- Save the generated test file in the tests directory.`,
      `Steps:`,
      ...params.steps.map((step, index) => `- ${index + 1}. ${step}`),
    ].join('\n');

  server.addTool({
    name: 'appium_generate_tests',
    description:
      'Return a workflow to execute the scenario with MCP tools, then generate test code from observed interactions. Prefer appium_find_element; generate_locators is for broad inspection.',
    parameters: generateTestSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof generateTestSchema>,
      _context: Record<string, unknown> | undefined,
    ): Promise<ContentResult> => textResult(instructions({steps: args.steps})),
  });
}
