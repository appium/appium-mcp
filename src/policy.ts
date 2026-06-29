import type { FastMCP } from 'fastmcp';
import log from './logger.js';

export interface AppiumMcpPolicy {
  allowTools?: readonly RegExp[];
  allowResources?: readonly RegExp[];
}

export type PolicyTargetKind = 'tool' | 'resource';

export type PolicyDecisionReason =
  'empty_allowlist' | 'matched_allowlist' | 'not_in_allowlist';

export interface PolicyDecision {
  allowed: boolean;
  reason: PolicyDecisionReason;
  targetKind: PolicyTargetKind;
  target: string;
  matchedRule?: string;
}

type AddToolParam = Parameters<FastMCP['addTool']>[0];
type AddToolsParam = Parameters<FastMCP['addTools']>[0];
type AddResourceParam = Parameters<FastMCP['addResource']>[0];
type AddResourcesParam = Parameters<FastMCP['addResources']>[0];
type AddResourceTemplateParam = Parameters<FastMCP['addResourceTemplate']>[0];
type AddResourceTemplatesParam = Parameters<FastMCP['addResourceTemplates']>[0];
type PolicyResourceParam = AddResourceParam | AddResourceTemplateParam;

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
    if (!isToolAllowed(policy, toolDef)) {
      return;
    }
    return originalAddTool(toolDef);
  }) as FastMCP['addTool'];

  const originalAddTools = server.addTools.bind(server);
  server.addTools = ((
    toolDefs: AddToolsParam
  ): ReturnType<FastMCP['addTools']> => {
    const allowedToolDefs = toolDefs.filter((toolDef) =>
      isToolAllowed(policy, toolDef)
    ) as AddToolsParam;
    if (allowedToolDefs.length === 0) {
      return;
    }
    return originalAddTools(allowedToolDefs);
  }) as FastMCP['addTools'];

  const originalAddResource = server.addResource.bind(server);
  server.addResource = ((
    resourceDef: AddResourceParam
  ): ReturnType<FastMCP['addResource']> => {
    if (!isResourceAllowed(policy, resourceDef, 'resource')) {
      return;
    }
    return originalAddResource(resourceDef);
  }) as FastMCP['addResource'];

  const originalAddResources = server.addResources.bind(server);
  server.addResources = ((
    resourceDefs: AddResourcesParam
  ): ReturnType<FastMCP['addResources']> => {
    const allowedResourceDefs = resourceDefs.filter((resourceDef) =>
      isResourceAllowed(policy, resourceDef, 'resource')
    ) as AddResourcesParam;
    if (allowedResourceDefs.length === 0) {
      return;
    }
    return originalAddResources(allowedResourceDefs);
  }) as FastMCP['addResources'];

  const originalAddResourceTemplate = server.addResourceTemplate.bind(server);
  server.addResourceTemplate = ((
    resourceTemplateDef: AddResourceTemplateParam
  ): ReturnType<FastMCP['addResourceTemplate']> => {
    if (!isResourceAllowed(policy, resourceTemplateDef, 'resource template')) {
      return;
    }
    return originalAddResourceTemplate(resourceTemplateDef);
  }) as FastMCP['addResourceTemplate'];

  const originalAddResourceTemplates = server.addResourceTemplates.bind(server);
  server.addResourceTemplates = ((
    resourceTemplateDefs: AddResourceTemplatesParam
  ): ReturnType<FastMCP['addResourceTemplates']> => {
    const allowedResourceTemplateDefs = resourceTemplateDefs.filter(
      (resourceTemplateDef) =>
        isResourceAllowed(policy, resourceTemplateDef, 'resource template')
    ) as AddResourceTemplatesParam;
    if (allowedResourceTemplateDefs.length === 0) {
      return;
    }
    return originalAddResourceTemplates(allowedResourceTemplateDefs);
  }) as FastMCP['addResourceTemplates'];
}

function isToolAllowed(
  policy: AppiumMcpPolicy,
  toolDef: AddToolParam
): boolean {
  const decision = evaluatePolicyTarget(policy, 'tool', toolDef.name);
  if (!decision.allowed) {
    log.warn(
      `Policy denied tool registration: ${formatPolicyTargetForLog(decision.target)} (${decision.reason})`
    );
  }
  return decision.allowed;
}

function isResourceAllowed(
  policy: AppiumMcpPolicy,
  resourceDef: PolicyResourceParam,
  label: 'resource' | 'resource template'
): boolean {
  const target = readResourceName(resourceDef);
  const decision = evaluatePolicyTarget(policy, 'resource', target);
  if (!decision.allowed) {
    log.warn(
      `Policy denied ${label} registration: ${formatResourceTargetForLog(resourceDef, decision.target)} (${decision.reason})`
    );
  }
  return decision.allowed;
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

function formatResourceTargetForLog(
  resourceDef: PolicyResourceParam,
  target: string
): string {
  const label = formatPolicyTargetForLog(target);
  const identifiers = readResourceLogIdentifiers(resourceDef);

  return identifiers.length > 0 ? `${label}; ${identifiers.join('; ')}` : label;
}

function readResourceLogIdentifiers(
  resourceDef: PolicyResourceParam
): string[] {
  const identifiers: string[] = [];
  if ('uri' in resourceDef && resourceDef.uri.length > 0) {
    identifiers.push(`uri=${resourceDef.uri}`);
  }
  if ('uriTemplate' in resourceDef && resourceDef.uriTemplate.length > 0) {
    identifiers.push(`uriTemplate=${resourceDef.uriTemplate}`);
  }
  return identifiers;
}

function readResourceName(resourceDef: PolicyResourceParam): string {
  return typeof resourceDef.name === 'string' ? resourceDef.name : '';
}
