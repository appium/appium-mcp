import { FastMCP } from 'fastmcp';
import { z } from 'zod';

export default function generateTest(server: FastMCP): void {
  const generateTestSchema = z.object({
    steps: z.array(z.string()).describe('The steps of the test'),
  });

  const instructions = (params: { steps: string[] }) =>
    [
      `## Instructions`,
      `- You are an Appium test generator.`,
      `- You are given a scenario and you need to generate a appium test for it.`,
      `- Request user to select the platform first using select_platform tool and create a session`,
      `- Use generate_locators tool to fetch all interactable elements from the current screen and use it to generate the tests`,
      `- Element can only be clicked only if it is clickable.`,
      `- Text can entered in the element only if it is focusable`,
      `- If any interaction on element is failed, retry again with a differnt possible locator in the hierrarchy`,
      `- Interact with the app using the tools provided and generate the test`,
      '- DO NOT generate test code based on the scenario alone. DO run steps one by one using the tools provided instead.',
      '- Only after all steps are completed, emit a Appium test based on message history',
      '- Save generated test file in the tests directory',
      `- Use generate://code-with-locators resource as reference for code generation`,
      `- Always call find_element_tool to retrieve the element UUID before interacting with the element`,
      `Steps:`,
      ...params.steps.map((step, index) => `- ${index + 1}. ${step}`),
    ].join('\n');

  server.addTool({
    name: 'appium_generate_tests',
    description: 'Generate tests for a given mobile app',
    parameters: generateTestSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => ({
      content: [
        {
          type: 'text',
          text: instructions({
            steps: args.steps,
          }),
        },
      ],
    }),
  });
}
