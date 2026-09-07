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

const CREATE_SESSION_DESCRIPTION =
  'DEFAULT MODE: embedded drivers; no separate Appium process is needed. ' +
  'Use select_device tool FIRST; ask for platform/device if unknown. ' +
  'For iOS simulators run prepare_ios_simulator, then create with the selected platform; do NOT pass remoteServerUrl. ' +
  'NEVER invent a localhost URL. ' +
  'REMOTE SERVER MODE: only when user explicitly provides a URL; skip select_device, infer platform/device from context, ' +
  'and pass remoteServerUrl and capabilities directly. ';

const schema = z.object({
  action: z
    .enum(SESSION_ACTIONS)
    .describe(
      `create: ${CREATE_SESSION_DESCRIPTION}` +
        'attach: connect without taking ownership; requires remoteServerUrl, sessionId, and capabilities.platformName. ' +
        'detach: forget an attached session without deleting the real remote session. ' +
        'delete: stop a session and clean up. detach/delete default to the active session. ' +
        'list: show sessions, active flag, ownership, context. select: activate sessionId for subsequent calls.',
    ),
  platform: z
    .enum(DRIVER_MODE_PLATFORMS)
    .optional()
    .describe(
      'Required for create. Local: match select_device. Remote: infer from context; general supports non-Android/iOS drivers.',
    ),
  capabilities: z
    .string()
    .optional()
    .describe(
      'W3C capabilities as a JSON string. Create: optional overrides for ios/android; pass-through for general. ' +
        'Serialize the full capabilitiesHint, preserving booleans/numbers. ' +
        'Attach: include platformName for correct protocol commands, e.g. \'{"platformName":"iOS"}\'.',
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
    .describe('Required for attach and select. For delete/detach, defaults to the active session.'),
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
