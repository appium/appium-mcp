import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { createSessionAction } from './create-session.js';
import { deleteSessionAction } from './delete-session.js';
import { listSessionsAction } from './list-sessions.js';
import { selectSessionAction } from './select-session.js';
import { errorResult, toolErrorMessage } from '../tool-response.js';

const SESSION_ACTIONS = ['create', 'delete', 'list', 'select'] as const;

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
        'delete: Delete a mobile session and clean up resources. If sessionId is omitted, deletes the active session.' +
        'list: List all active Appium sessions managed by this MCP server, including active flag and current context.' +
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
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Optional W3C capabilities for create. Applied on top of defaults for ios/android, or used as-is for general. ' +
        'Common: appium:app, appium:deviceName, appium:platformVersion, appium:bundleId.'
    ),
  remoteServerUrl: z
    .string()
    .optional()
    .describe(
      'Remote Appium server URL for create (e.g. http://localhost:4723). Omit to use local server.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'For delete: session to remove (defaults to active). For select: session to activate. Required for select.'
    ),
});

export default function session(server: FastMCP): void {
  server.addTool({
    name: 'appium_session_management',
    description:
      'Manage Appium sessions. Use action=create to start a session, delete to stop one, list to see all active sessions, or select to switch the active session.',
    parameters: schema,
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: z.infer<typeof schema>): Promise<any> => {
      try {
        if (args.action === 'create') {
          if (!args.platform) {
            return errorResult('platform is required for create action');
          }
          return createSessionAction({
            platform: args.platform,
            capabilities: args.capabilities,
            remoteServerUrl: args.remoteServerUrl,
          });
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
