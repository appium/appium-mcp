import registerTools from './tools/index.js';
import log from './logger.js';
import { AppiumMcpCore, McpRegistry, type AppiumMcpPlugin } from './plugin.js';

const CORE_SOURCE = 'appium-mcp core';

export type VerificationDuplicateKind = 'plugin' | 'tool';

export interface VerificationEntry {
  name: string;
  source: string;
}

export interface VerificationDuplicate {
  kind: VerificationDuplicateKind;
  name: string;
  entries: VerificationEntry[];
}

export interface VerificationError {
  source: string;
  message: string;
}

export interface VerificationReport {
  ok: boolean;
  pluginCount: number;
  toolCount: number;
  duplicates: VerificationDuplicate[];
  errors: VerificationError[];
}

export interface VerifyAppiumMcpNamesOptions {
  plugins?: AppiumMcpPlugin[];
  errors?: VerificationError[];
}

type ToolDef = {
  name: string;
};

type CapabilityCollector = {
  addTool(toolDef: ToolDef): void;
  addPrompt(promptDef: unknown): void;
  addResource(resourceDef: unknown): void;
  addResourceTemplate(resourceTemplateDef: unknown): void;
};

export function verifyAppiumMcpNames(
  options: VerifyAppiumMcpNamesOptions = {}
): VerificationReport {
  const plugins = options.plugins ?? [];
  const errors = [...(options.errors ?? [])];
  const duplicates: VerificationDuplicate[] = [];
  const toolEntries: VerificationEntry[] = [];
  let currentSource = CORE_SOURCE;

  const collector: CapabilityCollector = {
    addTool(toolDef: ToolDef) {
      toolEntries.push({
        name: toolDef.name,
        source: currentSource,
      });
    },
    addPrompt() {},
    addResource() {},
    addResourceTemplate() {},
  };

  const pluginEntries = plugins.map((plugin) => ({
    name: plugin.name,
    source: `plugin:${plugin.name}@${plugin.version}`,
  }));
  duplicates.push(...findDuplicates('plugin', pluginEntries));

  const seenPluginNames = new Set<string>();
  const registry = new McpRegistry(collector as never);
  const core = new AppiumMcpCore();

  for (const plugin of plugins) {
    if (seenPluginNames.has(plugin.name)) {
      continue;
    }
    seenPluginNames.add(plugin.name);
    if (typeof plugin.register !== 'function') {
      continue;
    }
    currentSource = `plugin:${plugin.name}`;
    try {
      plugin.register(registry, core);
    } catch (err: unknown) {
      errors.push({
        source: currentSource,
        message: errorMessage(err),
      });
    }
  }

  currentSource = CORE_SOURCE;
  try {
    withSuppressedRegistrationLogs(() => registerTools(collector as never));
  } catch (err: unknown) {
    errors.push({
      source: currentSource,
      message: errorMessage(err),
    });
  }
  duplicates.push(...findDuplicates('tool', toolEntries));

  return {
    ok: duplicates.length === 0 && errors.length === 0,
    pluginCount: new Set(pluginEntries.map((entry) => entry.name)).size,
    toolCount: toolEntries.length,
    duplicates,
    errors,
  };
}

export function formatVerificationReport(report: VerificationReport): string {
  const lines = [
    `Checked ${report.pluginCount} plugin name(s) and ${report.toolCount} tool name(s).`,
  ];

  if (report.ok) {
    lines.push('No duplicate plugin or tool names found.');
    return lines.join('\n');
  }

  if (report.duplicates.length > 0) {
    lines.push('Duplicate names found:');
    for (const duplicate of report.duplicates) {
      const sources = duplicate.entries
        .map((entry) => `    - ${entry.source}`)
        .join('\n');
      lines.push(`  ${duplicate.kind}: ${duplicate.name}\n${sources}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push('Registration/load errors found:');
    for (const error of report.errors) {
      lines.push(`  ${error.source}: ${error.message}`);
    }
  }

  return lines.join('\n');
}

function withSuppressedRegistrationLogs(fn: () => void): void {
  const mutableLog = log as typeof log & { info: (...args: unknown[]) => void };
  const originalInfo = mutableLog.info;
  mutableLog.info = () => {};
  try {
    fn();
  } finally {
    mutableLog.info = originalInfo;
  }
}

function findDuplicates(
  kind: VerificationDuplicateKind,
  entries: VerificationEntry[]
): VerificationDuplicate[] {
  const byName = new Map<string, VerificationEntry[]>();
  for (const entry of entries) {
    const existing = byName.get(entry.name) ?? [];
    existing.push(entry);
    byName.set(entry.name, existing);
  }

  return Array.from(byName.entries())
    .filter(([, duplicateEntries]) => duplicateEntries.length > 1)
    .map(([name, duplicateEntries]) => ({
      kind,
      name,
      entries: duplicateEntries,
    }));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
