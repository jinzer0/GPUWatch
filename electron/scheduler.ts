import { helperContract, type HelperAction, type HelperRequestEnvelope, type HelperResponseEnvelope } from './helperContract.js';
import type { HelperRunner } from './helperRunner.js';

export interface ElectronScheduler {
  start(): void;
  stop(): void;
  readonly isRunning: boolean;
  run<Action extends HelperAction, Payload extends object, Data = unknown>(
    runner: HelperRunner,
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>>;
}

function contractError(type: string, message: string): HelperResponseEnvelope<never> {
  return {
    ok: false,
    error: {
      layer: 'helper_contract',
      type,
      message
    }
  };
}

function serverOverlapId(request: HelperRequestEnvelope<HelperAction, object>): string | null {
  const payload = request.payload as Record<string, unknown>;
  const directId = payload.id;
  if (typeof directId === 'string' && directId.trim().length > 0) {
    return directId;
  }

  const serverId = payload.serverId;
  if (typeof serverId === 'string' && serverId.trim().length > 0) {
    return serverId;
  }

  const input = payload.input;
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const inputId = (input as Record<string, unknown>).id;
    if (typeof inputId === 'string' && inputId.trim().length > 0) {
      return inputId;
    }
  }

  return null;
}

function contractEntry(action: HelperAction) {
  return helperContract.find((entry) => entry.helperAction === action);
}

export function createScheduler(): ElectronScheduler {
  let running = false;
  let dbQueue: Promise<unknown> = Promise.resolve();
  const activeServerActions = new Set<string>();

  async function runWithDbSerialization<Data>(mutatesDb: boolean, operation: () => Promise<HelperResponseEnvelope<Data>>) {
    if (!mutatesDb) {
      return operation();
    }

    const scheduled = dbQueue.then(operation, operation);
    dbQueue = scheduled.catch(() => undefined);
    return scheduled;
  }

  return {
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    get isRunning() {
      return running;
    },
    async run<Action extends HelperAction, Payload extends object, Data = unknown>(
      runner: HelperRunner,
      request: HelperRequestEnvelope<Action, Payload>
    ): Promise<HelperResponseEnvelope<Data>> {
      if (!running) {
        return contractError('scheduler_stopped', 'Electron helper scheduler is not running.') as HelperResponseEnvelope<Data>;
      }

      const entry = contractEntry(request.action);
      const serverId = entry?.pollingOverlapKey === 'server-id' ? serverOverlapId(request) : null;

      if (serverId && activeServerActions.has(serverId)) {
        return contractError('poll_already_running', 'poll already running for this server or same-server mutation is queued') as HelperResponseEnvelope<Data>;
      }

      if (serverId) {
        activeServerActions.add(serverId);
      }

      try {
        const mutatesDb = entry?.dbMutation !== undefined && entry.dbMutation !== 'none';
        return await runWithDbSerialization(mutatesDb, () => runner.run<Action, Payload, Data>(request));
      } finally {
        if (serverId) {
          activeServerActions.delete(serverId);
        }
      }
    }
  };
}
