import type { FastMCP } from 'fastmcp';
import log from './logger.js';

export interface AppiumMcpPolicy {
  allowTools?: readonly RegExp[];
  allowResources?: readonly RegExp[];
}

export type PolicyTargetKind = 'tool' | 'resource';

export type PolicyDecisionReason =
  | 'empty_allowlist'
  | 'matched_allowlist'
  | 'not_in_allowlist';

export interface PolicyDecision {
  allowed: boolean;
  reason: PolicyDecisionReason;
  targetKind: PolicyTargetKind;
  target: string;
  matchedRule?: string;
}

type AddToolParam = Parameters<FastMCP['addTool']>[0];
type AddResourceParam = Parameters<FastMCP['addResource']>[0];
type AddResourceTemplateParam = Parameters<FastMCP['addResourceTemplate']>[0];

export function evaluatePolicyTarget(
  policy: AppiumMcpPolicy | undefined,
  targetKind: PolicyTargetKind,
  target: string
): PolicyDecision {
  const allowlist =
    targetKind === 'tool' ? policy?.allowTools : policy?.allowResources;

  if (!allowlist || allowlist.length === 0) {
    return {
      allowed: true,
      reason: 'empty_allowlist',
      targetKind,
      target,
    };
  }

  for (const rule of allowlist) {
    if (matchesRule(rule, target)) {
      return {
        allowed: true,
        reason: 'matched_allowlist',
        targetKind,
        target,
        matchedRule: rule.toString(),
      };
    }
  }

  return {
    allowed: false,
    reason: 'not_in_allowlist',
    targetKind,
    target,
  };
}

export function installPolicy(server: FastMCP, policy?: AppiumMcpPolicy): void {
  if (!policy) {
    return;
  }

  validatePolicy(policy);

  const originalAddTool = server.addTool.bind(server);
  server.addTool = ((toolDef: AddToolParam): ReturnType<FastMCP['addTool']> => {
    const decision = evaluatePolicyTarget(policy, 'tool', toolDef.name);
    if (!decision.allowed) {
      log.warn(
        `Policy denied tool registration: ${formatPolicyTargetForLog(decision.target)} (${decision.reason})`
      );
      return;
    }
    return originalAddTool(toolDef);
  }) as FastMCP['addTool'];

  const originalAddResource = server.addResource.bind(server);
  server.addResource = ((
    resourceDef: AddResourceParam
  ): ReturnType<FastMCP['addResource']> => {
    const target = readResourceName(resourceDef);
    const decision = evaluatePolicyTarget(policy, 'resource', target);
    if (!decision.allowed) {
      log.warn(
        `Policy denied resource registration: ${formatResourceTargetForLog(resourceDef, decision.target)} (${decision.reason})`
      );
      return;
    }
    return originalAddResource(resourceDef);
  }) as FastMCP['addResource'];

  const originalAddResourceTemplate = server.addResourceTemplate.bind(server);
  server.addResourceTemplate = ((
    resourceTemplateDef: AddResourceTemplateParam
  ): ReturnType<FastMCP['addResourceTemplate']> => {
    const target = readResourceName(resourceTemplateDef);
    const decision = evaluatePolicyTarget(policy, 'resource', target);
    if (!decision.allowed) {
      log.warn(
        `Policy denied resource template registration: ${formatResourceTargetForLog(resourceTemplateDef, decision.target)} (${decision.reason})`
      );
      return;
    }
    return originalAddResourceTemplate(resourceTemplateDef);
  }) as FastMCP['addResourceTemplate'];
}

function matchesRule(rule: RegExp, target: string): boolean {
  return new RegExp(rule.source, rule.flags).test(target);
}

function validatePolicy(policy: AppiumMcpPolicy): void {
  validateAllowlist(policy.allowTools, 'policy.allowTools');
  validateAllowlist(policy.allowResources, 'policy.allowResources');
}

function validateAllowlist(
  allowlist: readonly RegExp[] | undefined,
  label: string
): void {
  if (allowlist === undefined) {
    return;
  }

  if (!Array.isArray(allowlist)) {
    throw new TypeError(`${label} must be an array of RegExp values`);
  }

  for (const rule of allowlist) {
    if (!(rule instanceof RegExp)) {
      throw new TypeError(`${label} must contain only RegExp values`);
    }
  }
}

function formatPolicyTargetForLog(target: string): string {
  return target.length > 0 ? target : '<unnamed>';
}

function formatResourceTargetForLog(resourceDef: unknown, target: string): string {
  const label = formatPolicyTargetForLog(target);
  const identifiers = readResourceLogIdentifiers(resourceDef);

  return identifiers.length > 0 ? `${label}; ${identifiers.join('; ')}` : label;
}

function readResourceLogIdentifiers(resourceDef: unknown): string[] {
  if (resourceDef === null || typeof resourceDef !== 'object') {
    return [];
  }

  const record = resourceDef as Record<string, unknown>;
  return ['uri', 'uriTemplate']
    .map((key) => [key, record[key]] as const)
    .filter((entry): entry is readonly [string, string] => {
      const [, value] = entry;
      return typeof value === 'string' && value.length > 0;
    })
    .map(([key, value]) => `${key}=${value}`);
}

function readResourceName(resourceDef: unknown): string {
  if (resourceDef === null || typeof resourceDef !== 'object') {
    return '';
  }

  const record = resourceDef as Record<string, unknown>;
  const target = record.name ?? '';

  return typeof target === 'string' ? target : '';
}
