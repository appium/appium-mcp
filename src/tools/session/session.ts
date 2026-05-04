import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { attachSessionAction } from './attach-session.js';
import { createSessionAction } from './create-session.js';
import { deleteSessionAction } from './delete-session.js';
import { detachSessionAction } from './detach-session.js';
import { listSessionsAction } from './list-sessions.js';
import { selectSessionAction } from './select-session.js';
import { errorResult, toolErrorMessage } from '../tool-response.js';

const SESSION_ACTIONS = [
  'create',
  'attach',
  'detach',
  'delete',
  'list',
  'select',
] as const;

const CREATE_SESSION_DESCRIPTION = `Create a new Appium session with Android, iOS or any device/driver Appium supports.
      DEFAULT MODE (no remoteServerUrl) — USE THIS UNLESS THE USER EXPLICITLY PROVIDES A SERVER URL:
      - Drivers run embedded inside this MCP server; no separate Appium process is needed
      - Use select_device tool FIRST to discover devices and let the user choose platform and device
      - Then call action=create with the selected platform (do NOT pass remoteServerUrl)
      - For iOS simulators, call prepare_ios_simulator before action=create
      - DO NOT assume or default to any platform
      - NEVER invent a localhost URL (e.g. http://localhost:4723) — omitting remoteServerUrl IS the local/embedded mode
      REMOTE SERVER MODE (only when user explicitly provides a URL like http://localhost:4723):
      - SKIP select_device tool entirely
      - Infer the platform from the user's request (e.g., 'ios', 'android', or 'general')
      - If platform is 'general', treat the provided capabilities as a pass-through W3C/Appium capability set (useful for non-Android/iOS drivers like Windows, macOS, or custom drivers)
      - Infer device type from context when possible (e.g., 'simulator', 'real device')
      - Call session with action=create directly with platform, remoteServerUrl, and any other capabilities from the user's request
      - Example: User says 'start session with http://localhost:4723 for ios with iphone 17' → infer platform='ios' and call session(action=create) with remoteServerUrl and platform parameters`;

const schema = z.object({
  action: z
    .enum(SESSION_ACTIONS)
    .describe(
      'Action to perform. ' +
        `create: ${CREATE_SESSION_DESCRIPTION}` +
        'attach: Attach MCP Appium to an existing remote Appium session without taking ownership of its lifecycle. Requires remoteServerUrl and sessionId.' +
        'detach: Remove an attached Appium session from MCP Appium without deleting the real remote session. Defaults to the active session.' +
        'delete: Delete a mobile session and clean up resources. If sessionId is omitted, deletes the active session.' +
        'list: List all active Appium sessions managed by this MCP server, including active flag, ownership, and current context.' +
        'select: Set an existing Appium session as the active session for subsequent tool calls (requires sessionId).'
    ),
  platform: z
    .enum(['ios', 'android', 'general'])
    .optional()
    .describe(
      'Required for create. ' +
        'For local servers, must match the platform selected via select_device. ' +
        'Use "general" for non-Android/iOS drivers (Windows, macOS, custom). ' +
        'For remote servers, infer from context.'
    ),
  capabilities: z
    .string()
    .optional()
    .describe(
      'Optional W3C capabilities for create. Provide as a JSON string (e.g. \'{"appium:app":"/path/to/app","appium:platformVersion":"17.0"}\'). ' +
        'Applied on top of defaults for ios/android, or used as-is for general. ' +
        'Common: appium:app, appium:deviceName, appium:platformVersion, appium:bundleId. ' +
        'When passing from a capabilitiesHint result, serialize the full object to JSON — do NOT drop boolean or numeric values.'
    ),
  remoteServerUrl: z
    .string()
    .optional()
    .describe(
      'Remote Appium server URL for create or attach (e.g. http://localhost:4723). Omit to use local server for create.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'For attach: existing session to connect to. For delete: session to remove (defaults to active). For detach: attached session to remove from MCP (defaults to active). For select: session to activate. Required for attach and select.'
    ),
});

export default function session(server: FastMCP): void {
  server.addTool({
    name: 'appium_session_management',
    description:
      'Manage Appium sessions. Use action=create to start a session, attach to connect to an existing one, detach to forget an attached session, delete to stop one, list to see all active sessions, or select to switch the active session.',
    parameters: schema,
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>): Promise<any> => {
      try {
        // Parse capabilities: some LLMs (e.g. Gemini) pass a JSON string instead of an object.
        const parsedCapabilities: Record<string, any> | undefined = (() => {
          if (typeof args.capabilities === 'string') {
            try {
              return JSON.parse(args.capabilities) as Record<string, any>;
            } catch {
              return undefined;
            }
          }
          return args.capabilities;
        })();

        if (args.action === 'create') {
          if (!args.platform) {
            return errorResult('platform is required for create action');
          }
          return createSessionAction({
            platform: args.platform,
            capabilities: parsedCapabilities,
            remoteServerUrl: args.remoteServerUrl,
          });
        }

        if (args.action === 'attach') {
          if (!args.remoteServerUrl) {
            return errorResult('remoteServerUrl is required for attach action');
          }
          if (!args.sessionId) {
            return errorResult('sessionId is required for attach action');
          }
          return attachSessionAction({
            remoteServerUrl: args.remoteServerUrl,
            sessionId: args.sessionId,
            capabilities: parsedCapabilities,
          });
        }

        if (args.action === 'detach') {
          return detachSessionAction(args.sessionId);
        }

        if (args.action === 'delete') {
          return deleteSessionAction(args.sessionId);
        }

        if (args.action === 'list') {
          return listSessionsAction();
        }

        if (args.action === 'select') {
          if (!args.sessionId) {
            return errorResult('sessionId is required for select action');
          }
          return selectSessionAction(args.sessionId);
        }

        return errorResult(`Unknown action: ${args.action}`);
      } catch (err: unknown) {
        return errorResult(
          `Session action '${args.action}' failed: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
