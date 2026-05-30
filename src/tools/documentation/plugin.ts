import type { AppiumMcpPlugin, McpRegistry } from '../../plugin.js';
import { appiumDocumentationQueryTool } from './answer-appium.js';
import { appiumSkillsTool } from './appium-skills.js';

/**
 * Appium documentation plugin.
 *
 * Registers the documentation-focused tools:
 * - appium_documentation_query
 * - appium_skills
 */
export class AppiumDocument implements AppiumMcpPlugin {
  readonly name = 'appium-document';
  readonly version = '1.0.0';

  register(registry: McpRegistry): void {
    registry.addTool(appiumDocumentationQueryTool);
    registry.addTool(appiumSkillsTool);
  }
}

export default AppiumDocument;
