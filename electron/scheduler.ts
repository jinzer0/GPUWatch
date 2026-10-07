import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from './helperContract.js';
import { HELPER_TIMEOUT_MS, type HelperRunner } from './helperRunner.js';
import { contractEntry, contractError, isSerializedShortDbMutation } from './scheduler/contract.js';
import { runGuardedHelperAction, type SchedulerGuardState } from './scheduler/guards.js';
import { runPollTick } from './scheduler/pollingLoop.js';
import type { NotificationEvent, NotificationNotifier } from './notifications.js';
export type { ElectronSchedulerOptions } from './scheduler/types.js';
import type { ElectronSchedulerOptions } from './scheduler/types.js';

export interface ElectronScheduler {
  start(runner: HelperRunner): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  stop(): void;
  setNotifier(notifier: NotificationNotifier): void;
  readonly isRunning: boolean;
  run<Action extends HelperAction, Payload extends object, Data = unknown>(
    runner: HelperRunner,
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>>;
}

export function createScheduler(options: ElectronSchedulerOptions = {}): ElectronScheduler {
  let running = false;
  let ready = false;
  let generation = 0;
  let session = 0;
  let polling: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let pollingRunner: HelperRunner | null = null;
  let notifier = options.notifier;
  let notificationDrainTail = Promise.resolve();
  let lifecycleTail = Promise.resolve();
  let lifecycleResult = Promise.resolve();
  const inFlight = new Set<Promise<unknown>>();
  const guardState: SchedulerGuardState = {
    activeServerActions: new Set<string>(),
    activeNetworkActions: 0,
    dbQueue: Promise.resolve()
  };
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const pollConcurrency = Math.max(1, options.pollConcurrency ?? 4);
  const stalePollingMs = options.stalePollingMs ?? HELPER_TIMEOUT_MS['ssh-60s'] + 1000;
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  function track<T>(operation: Promise<T>): Promise<T> {
    inFlight.add(operation);
    void operation.then(() => inFlight.delete(operation), () => inFlight.delete(operation));
    return operation;
  }

  function current(epoch: number): boolean {
    return running && ready && generation === epoch;
  }

  function blockCollection(): number {
    ready = false;
    generation += 1;
    if (timer !== null) {
      clearIntervalFn(timer);
      timer = null;
    }
    return generation;
  }

  function isNotificationEvent(value: unknown): value is NotificationEvent {
    return typeof value === 'object' && value !== null && 'title' in value && 'body' in value && typeof value.title === 'string' && typeof value.body === 'string';
  }

  async function consumeNotifications(runner: HelperRunner, epoch: number): Promise<void> {
    if (!current(epoch)) return;
    const response = await track(runGuardedHelperAction<'consume_notification_events', object, readonly NotificationEvent[]>(guardState, pollConcurrency, runner, {
      action: 'consume_notification_events', payload: {}
    }));
    if (!current(epoch) || !response.ok || !Array.isArray(response.data)) return;
    for (const event of response.data) {
      if (!isNotificationEvent(event)) continue;
      try {
        notifier?.show({ title: event.title, body: event.body });
      } catch {
        // Notification delivery cannot affect polling.
      }
    }
  }

  function drainNotifications(runner: HelperRunner, epoch: number): Promise<void> {
    const drain = notificationDrainTail.then(() => consumeNotifications(runner, epoch));
    notificationDrainTail = drain.catch(() => undefined);
    return notificationDrainTail;
  }

  function pollOnce(runner: HelperRunner, epoch: number): Promise<void> {
    if (!current(epoch) || polling) return Promise.resolve();
    const operation = runPollTick(runner, {
      pollConcurrency, stalePollingMs, now,
      isRunning: () => current(epoch),
      run: (helper, request) => current(epoch)
        ? run(helper, request)
        : Promise.resolve(contractError('scheduler_not_ready', 'Electron helper scheduler is not ready.'))
    });
    polling = operation;
    void operation.then(() => { if (polling === operation) polling = null; }, () => { if (polling === operation) polling = null; });
    return operation;
  }

  function schedulePolling(runner: HelperRunner, epoch: number): void {
    void pollOnce(runner, epoch).catch(() => undefined);
    timer = setIntervalFn(() => {
      void pollOnce(runner, epoch).catch(() => undefined);
    }, pollIntervalMs);
  }

  function transition(collect: boolean): Promise<void> {
    const epoch = blockCollection();
    const owner = session;
    const runner = pollingRunner;
    // Snapshot every accepted operation, including queued short writes and renderer SSH.
    const pending = [...inFlight];
    const previousPoll = polling;
    const operation = lifecycleTail.then(async () => {
      await Promise.allSettled(pending);
      await previousPoll?.catch(() => undefined);
      await notificationDrainTail;
      if (!running || session !== owner) return;
      if (!runner) throw new Error('Availability reset requires a helper runner.');
      const discarded = await runGuardedHelperAction(guardState, pollConcurrency, runner, {
        action: 'consume_notification_events', payload: {}
      });
      if (!discarded.ok) throw new Error(`Could not discard pending notifications: ${discarded.error.message}`);
      if (!Array.isArray(discarded.data)) throw new Error('Could not discard pending notifications: invalid helper response.');
      if (!running || session !== owner) return;
      const response = await runGuardedHelperAction(guardState, pollConcurrency, runner, {
        action: 'reset_availability_observations', payload: { serverId: null }
      });
      if (!response.ok) throw new Error(`Availability reset failed: ${response.error.message}`);
      if (collect && running && session === owner && generation === epoch) {
        ready = true;
        if (current(epoch)) schedulePolling(runner, epoch);
      }
    });
    lifecycleTail = operation.catch(() => undefined);
    lifecycleResult = operation;
    return operation;
  }

  async function run<Action extends HelperAction, Payload extends object, Data = unknown>(
    runner: HelperRunner,
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>> {
    if (!running) {
      return contractError('scheduler_stopped', 'Electron helper scheduler is not running.') as HelperResponseEnvelope<Data>;
    }
    if (request.action === 'reset_availability_observations' || (!ready && (request.action === 'get_server_detail' || contractEntry(request.action)?.timeoutClass === 'ssh-60s' || isSerializedShortDbMutation(request.action)))) {
      return contractError('scheduler_not_ready', 'Electron helper scheduler is not ready.') as HelperResponseEnvelope<Data>;
    }
    const epoch = generation;
    const operation = (async () => {
      try {
        return await runGuardedHelperAction<Action, Payload, Data>(guardState, pollConcurrency, runner, request);
      } finally {
        if (request.action === 'refresh_server' && current(epoch)) await drainNotifications(runner, epoch);
      }
    })();
    return track(operation);
  }

  return {
    start(runner: HelperRunner) {
      if (running) return lifecycleResult;
      running = true;
      session += 1;
      pollingRunner = runner;
      return transition(true);
    },
    suspend() { return running ? transition(false) : Promise.resolve(); },
    resume() { return running ? transition(true) : Promise.resolve(); },
    stop() {
      running = false;
      session += 1;
      blockCollection();
      pollingRunner?.cancelActive?.();
      pollingRunner = null;
    },
    setNotifier(nextNotifier) { notifier = nextNotifier; },
    get isRunning() { return running && ready; },
    run
  };
}
