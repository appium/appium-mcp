import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import log from '../../logger.js';
import { resolveAppiumResourcesPath } from '../../utils/paths.js';
import { textResult } from '../tool-response.js';

type Platform = 'android' | 'ios';
type Driver = 'uiautomator2' | 'espresso' | 'xcuitest';
type Mode = 'setup' | 'troubleshoot';
type OptionalSkill = 'ffmpeg' | 'bundletool';

const ROOT = resolveAppiumResourcesPath('submodules', 'appium-skills');
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');
const SKILL_PATH = (name: string) =>
  path.join(ROOT, 'skills', name, 'SKILL.md');

const SETUP_SKILLS: Record<Platform, Partial<Record<Driver, string[]>>> = {
  android: {
    uiautomator2: [
      'environment-setup-node',
      'environment-setup-android',
      'environment-setup-uiautomator2',
    ],
    espresso: [
      'environment-setup-node',
      'environment-setup-android',
      'environment-setup-espresso',
    ],
  },
  ios: {
    xcuitest: ['environment-setup-node', 'environment-setup-xcuitest'],
  },
};

const TEMPLATE_HEADINGS: Record<string, string> = {
  'setup:uiautomator2': 'UiAutomator2',
  'setup:espresso': 'Espresso',
  'setup:xcuitest': 'XCUITest',
  'setup:xcuitest:real': 'XCUITest Real Device',
  'troubleshoot:uiautomator2': 'Troubleshooting',
  'troubleshoot:xcuitest': 'Troubleshooting',
};

export default function appiumSkills(server: any): void {
  server.addTool({
    name: 'appium_skills',
    description: `Return ordered Appium setup or troubleshooting skills from the vendored appium/skills repository.
      Use this before preparing a LOCAL Appium environment or diagnosing local prerequisite issues.`,
    parameters: z.object({
      platform: z.enum(['android', 'ios']).describe('Target local platform.'),
      driver: z
        .enum(['uiautomator2', 'espresso', 'xcuitest'])
        .describe('Target Appium automation driver.'),
      mode: z
        .enum(['setup', 'troubleshoot'])
        .optional()
        .default('setup')
        .describe(
          'Whether to prepare an environment or troubleshoot an existing failure.'
        ),
      realDevice: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'For ios + xcuitest only: true for a physical device, false for simulator setup.'
        ),
      includeOptional: z
        .array(z.enum(['ffmpeg', 'bundletool']))
        .optional()
        .default([])
        .describe(
          'Optional shared skills to include when explicitly requested.'
        ),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    execute: async (rawArgs: any): Promise<any> => {
      const parsed = (rawArgs ?? {}) as Partial<{
        platform: Platform;
        driver: Driver;
        mode: Mode;
        realDevice: boolean;
        includeOptional: OptionalSkill[];
      }>;
      const args = {
        platform: parsed.platform as Platform,
        driver: parsed.driver as Driver,
        mode: parsed.mode ?? 'setup',
        realDevice: parsed.realDevice ?? false,
        includeOptional: Array.isArray(parsed.includeOptional)
          ? parsed.includeOptional
          : [],
      };
      const { skillNames, ignoredOptional } = getSkillNames(args);

      log.info(
        `Loading Appium skills for ${args.platform}/${args.driver} (${args.mode}) from ${ROOT}`
      );

      const agentsMarkdown = await readMarkdown(AGENTS_PATH);
      const promptTemplate = getPromptTemplate(
        agentsMarkdown,
        getTemplateHeading(args.mode, args.driver, args.realDevice)
      );
      const skillContents = await Promise.all(
        skillNames.map(async (skillName) => ({
          name: skillName,
          markdown: await readMarkdown(SKILL_PATH(skillName)),
        }))
      );

      const lines = [
        `Appium skills for ${args.platform}/${args.driver}`,
        `Mode: ${args.mode}`,
        `Real device: ${args.realDevice ? 'yes' : 'no'}`,
        '',
        'Recommended skill order:',
        ...skillNames.map((skillName, index) => `${index + 1}. ${skillName}`),
      ];

      if (ignoredOptional.length) {
        lines.push(
          '',
          `Ignored optional skills: ${ignoredOptional.join(', ')}`
        );
      }

      lines.push('', 'Source files:', '- AGENTS.md');
      lines.push(
        ...skillNames.map((skillName) => `- skills/${skillName}/SKILL.md`)
      );

      if (promptTemplate) {
        lines.push('', 'Prompt template:', '```text', promptTemplate, '```');
      }

      lines.push('', '--- AGENTS.md ---', agentsMarkdown.trim());
      for (const skill of skillContents) {
        lines.push(
          '',
          `--- skills/${skill.name}/SKILL.md ---`,
          skill.markdown.trim()
        );
      }

      return textResult(lines.join('\n'));
    },
  });
}

/**
 * Get the list of skill names to return based on the input arguments,
 * and determine which optional skills were ignored.
 * @param args
 * @returns
 */
function getSkillNames(args: {
  platform: Platform;
  driver: Driver;
  mode: Mode;
  realDevice: boolean;
  includeOptional: OptionalSkill[];
}): { skillNames: string[]; ignoredOptional: OptionalSkill[] } {
  const { platform, driver, mode, realDevice, includeOptional } = args;

  if (realDevice && platform !== 'ios') {
    throw new Error('realDevice=true is only supported for ios targets');
  }

  if (mode === 'troubleshoot' && driver === 'espresso') {
    throw new Error(
      'Troubleshooting guidance is currently scoped to uiautomator2 or xcuitest, matching the upstream appium/skills repository.'
    );
  }

  const baseSkills = SETUP_SKILLS[platform][driver];
  if (!baseSkills) {
    throw new Error(
      platform === 'android'
        ? 'xcuitest is only valid for iOS local environments'
        : 'Only xcuitest is valid for iOS local environments'
    );
  }

  const skillNames = [...baseSkills];
  if (realDevice) {
    skillNames.push('xcuitest-real-device-config');
  }
  if (mode === 'troubleshoot') {
    skillNames.push('appium-troubleshooting');
  }

  const ignoredOptional: OptionalSkill[] = [];
  for (const optional of includeOptional) {
    if (optional === 'ffmpeg') {
      skillNames.push('environment-setup-ffmpeg');
      continue;
    }
    if (optional === 'bundletool' && platform === 'android') {
      skillNames.push('environment-setup-bundletool');
      continue;
    }
    ignoredOptional.push(optional);
  }

  return { skillNames, ignoredOptional };
}

function getTemplateHeading(
  mode: Mode,
  driver: Driver,
  realDevice: boolean
): string | null {
  return (
    TEMPLATE_HEADINGS[
      `${mode}:${driver}${realDevice && mode === 'setup' ? ':real' : ''}`
    ] ?? null
  );
}

function getPromptTemplate(
  agentsMarkdown: string,
  heading: string | null
): string | null {
  if (!heading) {
    return null;
  }

  const section = agentsMarkdown.split(`### Template: ${heading}\n`)[1];
  if (!section) {
    return null;
  }

  return section.match(/```text\n([\s\S]*?)```/)?.[1]?.trim() ?? null;
}

async function readMarkdown(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    throw new Error(
      `Failed to load ${path.relative(ROOT, filePath)}. Ensure the appium-skills submodule is initialized.`
    );
  }
}
