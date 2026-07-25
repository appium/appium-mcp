#!/usr/bin/env node

import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const MAX_DISCOVERY_CHARS = 45_000;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const LARGEST_TOOL_COUNT = 10;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const serverEntry = join(projectRoot, 'dist', 'index.js');

if (!existsSync(serverEntry)) {
  console.error(`Built server not found at ${serverEntry}. Run "npm run build" first.`);
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  cwd: projectRoot,
  env: {
    AI_VISION_ENABLED: 'false',
    APPIUM_MCP_DOCS_ENABLED: 'false',
    APPIUM_MCP_OTEL_ENABLED: 'false',
    NO_UI: 'true',
  },
  stderr: 'ignore',
});
const client = new Client({
  name: 'appium-mcp-tool-footprint-audit',
  version: '1.0.0',
});

try {
  await client.connect(transport);
  const result = await client.listTools();
  const payloadChars = JSON.stringify(result).length;
  const withoutDescriptionsChars = JSON.stringify(removeDescriptionFields(result)).length;
  const withoutParameterDescriptionsChars = JSON.stringify(removeParameterDescriptions(result)).length;
  const estimatedTokens = Math.ceil(payloadChars / ESTIMATED_CHARS_PER_TOKEN);
  const remainingChars = MAX_DISCOVERY_CHARS - payloadChars;
  const largestTools = result.tools
    .map((tool) => ({
      name: tool.name,
      chars: JSON.stringify(tool).length,
    }))
    .sort((a, b) => b.chars - a.chars || a.name.localeCompare(b.name))
    .slice(0, LARGEST_TOOL_COUNT);

  console.log('MCP tool discovery footprint');
  console.log(`Tools: ${formatNumber(result.tools.length)}`);
  console.log(`Payload: ${formatNumber(payloadChars)} chars (~${formatNumber(estimatedTokens)} tokens)`);
  console.log(`Description overhead: ${formatNumber(payloadChars - withoutDescriptionsChars)} chars`);
  console.log(
    `Parameter-description overhead: ${formatNumber(payloadChars - withoutParameterDescriptionsChars)} chars`,
  );
  console.log(`Budget: ${formatNumber(MAX_DISCOVERY_CHARS)} chars (${formatSignedNumber(remainingChars)} remaining)`);
  console.log('Largest tools:');
  for (const tool of largestTools) {
    console.log(`  ${tool.name}: ${formatNumber(tool.chars)} chars`);
  }

  if (remainingChars < 0) {
    console.error(`Tool discovery payload exceeds the budget by ${formatNumber(-remainingChars)} chars.`);
    process.exitCode = 1;
  } else {
    console.log('Tool discovery payload is within budget.');
  }
} catch (error) {
  console.error(
    `Failed to audit MCP tool discovery footprint: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}

function removeDescriptionFields(value) {
  if (Array.isArray(value)) {
    return value.map(removeDescriptionFields);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description')
      .map(([key, child]) => [key, removeDescriptionFields(child)]),
  );
}

function removeParameterDescriptions(result) {
  return {
    ...result,
    tools: result.tools.map((tool) => ({
      ...tool,
      inputSchema: removeDescriptionFields(tool.inputSchema),
    })),
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatSignedNumber(value) {
  return `${value >= 0 ? '+' : '-'}${formatNumber(Math.abs(value))}`;
}
