import type { SessionInfo, SessionTarget } from './session-store.js';
import { resolveSessionTarget } from './session-store.js';

export interface BroadcastExecutionOptions {
  concurrency?: number;
  stopOnError?: boolean;
  throwIfEmpty?: boolean;
}

export interface BroadcastExecutionItem<T> {
  sessionId: string;
  platform: string | null;
  automationName: string | null;
  deviceName: string | null;
  status: 'success' | 'error';
  value?: T;
  error?: string;
}

export interface BroadcastExecutionResult<T> {
  mode: 'broadcast';
  target: SessionTarget;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<BroadcastExecutionItem<T>>;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toResultSkeleton<T>(session: SessionInfo): BroadcastExecutionItem<T> {
  return {
    sessionId: session.sessionId,
    platform: session.metadata.platform,
    automationName: session.metadata.automationName,
    deviceName: session.metadata.deviceName,
    status: 'error',
  };
}

export async function executeAcrossSessions<T>(
  target: SessionTarget,
  operation: (session: SessionInfo) => Promise<T>,
  options: BroadcastExecutionOptions = {}
): Promise<BroadcastExecutionResult<T>> {
  const sessions = resolveSessionTarget(target);
  if (!sessions.length) {
    if (options.throwIfEmpty !== false) {
      throw new Error('No sessions matched the requested target.');
    }

    return {
      mode: 'broadcast',
      target,
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }

  const concurrency = Math.max(1, options.concurrency ?? sessions.length);
  const results: Array<BroadcastExecutionItem<T> | undefined> = new Array(
    sessions.length
  );
  let nextIndex = 0;
  let shouldStop = false;

  const worker = async () => {
    while (!shouldStop) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= sessions.length) {
        return;
      }

      const session = sessions[currentIndex];
      try {
        const value = await operation(session);
        results[currentIndex] = {
          ...toResultSkeleton(session),
          status: 'success',
          value,
        };
      } catch (error) {
        results[currentIndex] = {
          ...toResultSkeleton(session),
          status: 'error',
          error: toErrorMessage(error),
        };

        if (options.stopOnError) {
          shouldStop = true;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, sessions.length) }, () =>
      worker()
    )
  );

  const finalizedResults: BroadcastExecutionItem<T>[] = results.map(
    (result, index) => {
      if (result) {
        return result;
      }

      return {
        ...toResultSkeleton<T>(sessions[index]),
        status: 'error',
        error:
          'Skipped because broadcast execution stopped after an earlier failure.',
      };
    }
  );

  const succeeded = finalizedResults.filter(
    (result) => result.status === 'success'
  ).length;

  return {
    mode: 'broadcast',
    target,
    total: finalizedResults.length,
    succeeded,
    failed: finalizedResults.length - succeeded,
    results: finalizedResults,
  };
}
