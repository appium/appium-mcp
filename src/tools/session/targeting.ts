import { z } from 'zod';
import {
  getActiveSessionGroupId,
  type SessionTarget,
} from '../../session-store.js';

export const sessionTargetSchema = z
  .object({
    targetKind: z
      .enum(['active', 'session', 'group', 'all'])
      .optional()
      .describe(
        'Optional target scope. Defaults to active. Use session, group, or all for multi-session operations.'
      ),
    sessionId: z
      .string()
      .optional()
      .describe('Required when targetKind is session.'),
    groupId: z
      .string()
      .optional()
      .describe(
        'Optional when targetKind is group. If omitted, the active session group is used.'
      ),
  })
  .superRefine((value, ctx) => {
    const targetKind = value.targetKind ?? 'active';

    if (targetKind === 'session' && !value.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionId'],
        message: 'sessionId is required when targetKind is session.',
      });
    }

    if (targetKind !== 'session' && value.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionId'],
        message: 'sessionId is only valid when targetKind is session.',
      });
    }

    if (!['group'].includes(targetKind) && value.groupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['groupId'],
        message: 'groupId is only valid when targetKind is group.',
      });
    }
  });

export type SessionTargetArgs = z.infer<typeof sessionTargetSchema>;

export function resolveSessionTargetFromArgs(
  args: SessionTargetArgs
): SessionTarget {
  const targetKind = args.targetKind ?? 'active';

  if (targetKind === 'group') {
    const groupId = args.groupId ?? getActiveSessionGroupId();
    if (!groupId) {
      throw new Error(
        'No groupId was provided and no active session group is selected.'
      );
    }

    return { kind: 'group', groupId };
  }

  if (targetKind === 'session') {
    return { kind: 'session', sessionId: args.sessionId! };
  }

  if (targetKind === 'all') {
    return { kind: 'all' };
  }

  return { kind: 'active' };
}
