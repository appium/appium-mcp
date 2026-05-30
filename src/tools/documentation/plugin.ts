import type { AppiumMcpPlugin, McpRegistry } from '../../plugin.js';
import { appiumDocumentationQueryTool } from './answer-appium.js';
import { appiumSkillsTool } from './appium-skills.js';
import pkg from '../../../package.json' with { type: 'json' };

/**
 * Appium documentation plugin.
 *
 * Registers the documentation-focused tools:
 * - appium_documentation_query
 * - appium_skills
 */
export class AppiumDocumentation implements AppiumMcpPlugin {
  readonly name = 'appium-document';
  readonly version = pkg.version;

  register(registry: McpRegistry): void {
    registry.addTool(appiumDocumentationQueryTool);
    registry.addTool(appiumSkillsTool);
  }
}
