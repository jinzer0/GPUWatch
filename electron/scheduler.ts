import { helperContract, type HelperAction, type HelperRequestEnvelope, type HelperResponseEnvelope } from './helperContract.js';
import { HELPER_TIMEOUT_MS, type HelperRunner } from './helperRunner.js';

interface ServerRecord {
  id: string;
  enabled: boolean;
  pollingIntervalSeconds: number;
}

interface ServerHealth {
  status: string;
  lastPollStartedAt: string | null;
  lastPollFinishedAt: string | null;
  lastSuccessAt: string | null;
}

interface ServerDetail {
  health: ServerHealth;
}

export interface ElectronSchedulerOptions {
  pollIntervalMs?: number;
  pollConcurrency?: number;
  stalePollingMs?: number;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export interface ElectronScheduler {
  start(runner?: HelperRunner): void;
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

function isNetworkServerAction(action: HelperAction): boolean {
  return action === 'test_connection' || action === 'refresh_server';
}

function isSerializedShortDbMutation(action: HelperAction): boolean {
  const entry = contractEntry(action);
  return entry?.dbMutation !== undefined && entry.dbMutation !== 'none' && entry.dbMutation !== 'poll-health-start-and-result-write';
}

function isSuccess<Data>(response: HelperResponseEnvelope<Data>): response is { ok: true; data: Data } {
  return response.ok;
}

function healthReference(health: ServerHealth): string | null {
  return health.lastPollFinishedAt ?? health.lastPollStartedAt ?? health.lastSuccessAt;
}

function serverDue(server: ServerRecord, health: ServerHealth | null, now: Date, stalePollingMs: number): boolean {
  if (!server.enabled) {
    return false;
  }

  if (!health) {
    return true;
  }

  if (health.status === 'disabled') {
    return false;
  }

  const reference = healthReference(health);
  if (health.status === 'polling') {
    if (!reference) {
      return false;
    }

    const referenceMs = Date.parse(reference);
    return !Number.isNaN(referenceMs) && now.getTime() - referenceMs >= stalePollingMs;
  }

  if (!reference) {
    return true;
  }

  const referenceMs = Date.parse(reference);
  if (Number.isNaN(referenceMs)) {
    return true;
  }

  const intervalSeconds = health.status === 'offline' ? server.pollingIntervalSeconds * 2 : server.pollingIntervalSeconds;
  return now.getTime() - referenceMs >= intervalSeconds * 1000;
}

export function createScheduler(options: ElectronSchedulerOptions = {}): ElectronScheduler {
  let running = false;
  let polling = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let pollingRunner: HelperRunner | null = null;
  let dbQueue: Promise<unknown> = Promise.resolve();
  const activeServerActions = new Set<string>();
  let activeNetworkActions = 0;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const pollConcurrency = Math.max(1, options.pollConcurrency ?? 4);
  const stalePollingMs = options.stalePollingMs ?? HELPER_TIMEOUT_MS['ssh-60s'] + 1000;
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  async function runWithDbSerialization<Data>(mutatesDb: boolean, operation: () => Promise<HelperResponseEnvelope<Data>>) {
    if (!mutatesDb) {
      return operation();
    }

    const scheduled = dbQueue.then(operation, operation);
    dbQueue = scheduled.catch(() => undefined);
    return scheduled;
  }

  async function runPollTick(runner: HelperRunner): Promise<void> {
    if (!running || polling) {
      return;
    }

    polling = true;
    try {
      const serversResponse = await run<HelperAction, object, ServerRecord[]>(runner, { action: 'list_servers', payload: {} });
      if (!isSuccess<ServerRecord[]>(serversResponse)) {
        return;
      }

      const dueServers: ServerRecord[] = [];
      for (const server of serversResponse.data) {
        if (!server.enabled) {
          continue;
        }

        const detailResponse = await run<HelperAction, object, ServerDetail | null>(runner, {
          action: 'get_server_detail',
          payload: { id: server.id }
        });
        const health = isSuccess<ServerDetail | null>(detailResponse) ? (detailResponse.data?.health ?? null) : null;
        if (serverDue(server, health, now(), stalePollingMs)) {
          dueServers.push(server);
        }
      }

      let cursor = 0;
      const workers = Array.from({ length: Math.min(pollConcurrency, dueServers.length) }, async () => {
        while (running) {
          const server = dueServers[cursor];
          cursor += 1;
          if (!server) {
            return;
          }

          await run(runner, { action: 'refresh_server', payload: { id: server.id } });
        }
      });
      await Promise.all(workers);
    } finally {
      polling = false;
    }
  }

  function schedulePolling(runner: HelperRunner): void {
    void runPollTick(runner).catch(() => undefined);
    timer = setIntervalFn(() => {
      void runPollTick(runner).catch(() => undefined);
    }, pollIntervalMs);
  }

  async function run<Action extends HelperAction, Payload extends object, Data = unknown>(
    runner: HelperRunner,
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>> {
    if (!running) {
      return contractError('scheduler_stopped', 'Electron helper scheduler is not running.') as HelperResponseEnvelope<Data>;
    }

    const entry = contractEntry(request.action);
    const serverId = entry?.pollingOverlapKey === 'server-id' && isNetworkServerAction(request.action) ? serverOverlapId(request) : null;

    if (serverId && activeServerActions.has(serverId)) {
      return contractError('poll_already_running', 'poll already running for this server or same-server mutation is queued') as HelperResponseEnvelope<Data>;
    }

    const networkAction = isNetworkServerAction(request.action);
    if (networkAction && activeNetworkActions >= pollConcurrency) {
      return contractError('poll_already_running', 'poll already running for this server or same-server mutation is queued') as HelperResponseEnvelope<Data>;
    }

    if (serverId) {
      activeServerActions.add(serverId);
    }
    if (networkAction) {
      activeNetworkActions += 1;
    }

    try {
      return await runWithDbSerialization(isSerializedShortDbMutation(request.action), () => runner.run<Action, Payload, Data>(request));
    } finally {
      if (networkAction) {
        activeNetworkActions -= 1;
      }
      if (serverId) {
        activeServerActions.delete(serverId);
      }
    }
  }

  return {
    start(runner?: HelperRunner) {
      if (running) {
        return;
      }
      running = true;
      if (runner) {
        pollingRunner = runner;
        schedulePolling(runner);
      }
    },
    stop() {
      running = false;
      pollingRunner?.cancelActive?.();
      pollingRunner = null;
      if (timer) {
        clearIntervalFn(timer);
        timer = null;
      }
    },
    get isRunning() {
      return running;
    },
    run
  };
}
