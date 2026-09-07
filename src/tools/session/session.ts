import type {FastMCP} from 'fastmcp';
import {z} from 'zod';

import {errorResult, toolErrorMessage} from '../tool-response.js';
import {attachSessionAction} from './attach-session.js';
import {createSessionAction, DRIVER_MODE_PLATFORMS} from './create-session.js';
import {deleteSessionAction} from './delete-session.js';
import {detachSessionAction} from './detach-session.js';
import {listSessionsAction} from './list-sessions.js';
import {selectSessionAction} from './select-session.js';

const SESSION_ACTIONS = ['create', 'attach', 'detach', 'delete', 'list', 'select'] as const;

const CREATE_SESSION_DESCRIPTION = [
  'Create a new Appium session.',
  'DEFAULT MODE (no remoteServerUrl): use unless the user explicitly provides a server URL.',
  '- Drivers run embedded inside this MCP server; no separate Appium process is needed.',
  '- Use select_device tool FIRST to discover devices. Ask for platform/device if unknown; do not assume a platform.',
  '- For iOS simulators, run prepare_ios_simulator before creating the session.',
  '- Call appium_session_management action=create with the selected platform and any returned capabilitiesHint serialized as capabilities.',
  '- Do NOT pass remoteServerUrl for local/embedded mode. NEVER invent a localhost URL.',
  'REMOTE SERVER MODE (only when user explicitly provides a URL):',
  '- Skip local device selection and preparation; do not call select_device.',
  '- Infer platform and device type from the request when possible; ask if unclear.',
  '- Use platform=general for non-Android/iOS drivers (Windows, macOS, custom); capabilities pass through without platform defaults.',
  '- Call appium_session_management action=create with platform, remoteServerUrl, and the requested capabilities.',
  '- Example: "create an iOS session at http://localhost:4723" means platform=ios and remoteServerUrl=http://localhost:4723; do not discover local devices.',
].join('\n');

const schema = z.object({
  action: z
    .enum(SESSION_ACTIONS)
    .describe(
      `create: ${CREATE_SESSION_DESCRIPTION}\n` +
        'attach: connect to an existing remote Appium session without taking ownership of its lifecycle. ' +
        'Requires remoteServerUrl and sessionId; capabilities are fetched from the remote server.\n' +
        'detach: remove an attached session from MCP without deleting the real remote session. Defaults to the active session.\n' +
        'delete: delete a session and clean up resources. Defaults to the active session.\n' +
        'list: list managed sessions with active flag, ownership, and current context.\n' +
        'select: set sessionId as the active session for subsequent calls; requires sessionId.',
    ),
  platform: z
    .enum(DRIVER_MODE_PLATFORMS)
    .optional()
    .describe(
      'Required for create. For local sessions, match the platform selected via select_device. ' +
        'For remote sessions, infer from the request; general supports non-Android/iOS drivers (Windows, macOS, custom) and requires remoteServerUrl.',
    ),
  capabilities: z
    .string()
    .optional()
    .describe(
      'Optional W3C capabilities as a JSON string, e.g. \'{"appium:app":"/path/to/app","appium:platformVersion":"17.0"}\'. ' +
        'Create: overrides defaults for ios/android; passed through as-is for general. ' +
        'Common keys: appium:app, appium:deviceName, appium:udid, appium:platformVersion, appium:bundleId. ' +
        'When using capabilitiesHint from a preparation tool, serialize the full object to JSON; preserve boolean and numeric values. ' +
        'Attach: optional fallback values (e.g. \'{"platformName":"iOS"}\'); capabilities fetched from the server take precedence.',
    ),
  remoteServerUrl: z
    .string()
    .optional()
    .describe(
      'Remote Appium server URL for create or attach (e.g. http://localhost:4723). Omit to use local server for create.',
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'Required for attach and select: the existing session to connect to or activate. ' +
        'For delete: session to delete. For detach: attached session to forget without stopping it. ' +
        'Delete/detach default to the active session when omitted.',
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
        let parsedCapabilities: Record<string, any> | undefined;
        if (typeof args.capabilities === 'string') {
          try {
            parsedCapabilities = JSON.parse(args.capabilities) as Record<string, any>;
          } catch (err: unknown) {
            return errorResult(`Invalid capabilities JSON: ${toolErrorMessage(err)}`);
          }
        } else {
          parsedCapabilities = args.capabilities;
        }

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
        return errorResult(`Session action '${args.action}' failed: ${toolErrorMessage(err)}`);
      }
    },
  });
}
