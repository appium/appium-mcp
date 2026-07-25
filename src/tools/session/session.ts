import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { attachSessionAction } from './attach-session.js';
import {
  createSessionAction,
  DRIVER_MODE_PLATFORMS,
} from './create-session.js';
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

const schema = z.object({
  action: z
    .enum(SESSION_ACTIONS)
    .describe(
      'Action. DEFAULT/LOCAL MODE: create without remoteServerUrl uses an embedded driver; no separate Appium process is needed. ' +
        'Normally run select_device first and pass its platform; explicit target capabilities such as appium:udid can be used instead. ' +
        'Do NOT pass remoteServerUrl for local create, and NEVER invent a localhost URL. ' +
        'For a selected iOS simulator run prepare_ios_simulator; for a selected iOS real device run appium_prepare_ios_real_device. ' +
        'Then JSON-serialize the full returned capabilitiesHint as capabilities for create. ' +
        'REMOTE SERVER MODE: only when the user explicitly provides a URL; skip select_device and create with that URL/capabilities. ' +
        'platform=general is remote-only and requires remoteServerUrl. ' +
        'attach requires URL + sessionId (+ platformName capabilities) and connects without taking ownership. ' +
        'detach forgets an attached session without deleting the real remote session. delete stops; list shows; select activates.'
    ),
  platform: z
    .enum(DRIVER_MODE_PLATFORMS)
    .optional()
    .describe(
      'Required for create. For local create, match select_device when used. general is for other remote drivers and requires remoteServerUrl.'
    ),
  capabilities: z
    .string()
    .optional()
    .describe(
      'JSON-stringified W3C capabilities. create merges these over iOS/Android defaults or passes general through. ' +
        'When using a capabilitiesHint, serialize the full object without dropping boolean or numeric values. attach must include platformName.'
    ),
  remoteServerUrl: z
    .string()
    .optional()
    .describe(
      'Explicit remote server URL for create/attach; omit for embedded create.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'Target session; required for attach/select, otherwise defaults to active.'
    ),
});

export default function session(server: FastMCP): void {
  server.addTool({
    name: 'appium_session_management',
    description:
      'Create, attach, detach, delete, list, or select Appium sessions.',
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
            parsedCapabilities = JSON.parse(args.capabilities) as Record<
              string,
              any
            >;
          } catch (err: unknown) {
            return errorResult(
              `Invalid capabilities JSON: ${toolErrorMessage(err)}`
            );
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
        return errorResult(
          `Session action '${args.action}' failed: ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
