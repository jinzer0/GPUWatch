import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from './helperContract.js';
import { HELPER_TIMEOUT_MS, type HelperRunner } from './helperRunner.js';
import { contractError } from './scheduler/contract.js';
import { runGuardedHelperAction, type SchedulerGuardState } from './scheduler/guards.js';
import { runPollTick } from './scheduler/pollingLoop.js';
import type { NotificationEvent, NotificationNotifier } from './notifications.js';
export type { ElectronSchedulerOptions } from './scheduler/types.js';
import type { ElectronSchedulerOptions } from './scheduler/types.js';

export interface ElectronScheduler {
  start(runner?: HelperRunner): void;
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
  let polling = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let pollingRunner: HelperRunner | null = null;
  let notifier = options.notifier;
  let notificationDrainTail = Promise.resolve();
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

  function isNotificationEvent(value: unknown): value is NotificationEvent {
    return typeof value === 'object' && value !== null && 'title' in value && 'body' in value && typeof value.title === 'string' && typeof value.body === 'string';
  }

  async function consumeNotifications(runner: HelperRunner): Promise<void> {
    const response = await runGuardedHelperAction<'consume_notification_events', object, readonly NotificationEvent[]>(guardState, pollConcurrency, runner, {
      action: 'consume_notification_events',
      payload: {}
    });
    if (!response.ok) {
      return;
    }

    if (!Array.isArray(response.data)) {
      return;
    }

    for (const event of response.data) {
      if (!isNotificationEvent(event)) {
        continue;
      }
      try {
        notifier?.show({ title: event.title, body: event.body });
      } catch {
        // Notification delivery cannot affect polling.
      }
    }
  }

  function drainNotifications(runner: HelperRunner): Promise<void> {
    const drain = notificationDrainTail.then(
      () => consumeNotifications(runner),
      () => consumeNotifications(runner)
    );
    notificationDrainTail = drain.catch(() => undefined);
    return drain.catch(() => undefined);
  }

  async function pollOnce(runner: HelperRunner): Promise<void> {
    if (!running || polling) {
      return;
    }

    polling = true;
    try {
      await runPollTick(runner, {
        pollConcurrency,
        stalePollingMs,
        now,
        isRunning: () => running,
        run
      });
    } finally {
      polling = false;
    }
  }

  function schedulePolling(runner: HelperRunner): void {
    void pollOnce(runner).catch(() => undefined);
    timer = setIntervalFn(() => {
      void pollOnce(runner).catch(() => undefined);
    }, pollIntervalMs);
  }

  async function run<Action extends HelperAction, Payload extends object, Data = unknown>(
    runner: HelperRunner,
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>> {
    if (!running) {
      return contractError('scheduler_stopped', 'Electron helper scheduler is not running.') as HelperResponseEnvelope<Data>;
    }

    try {
      return await runGuardedHelperAction<Action, Payload, Data>(guardState, pollConcurrency, runner, request);
    } finally {
      if (request.action === 'refresh_server') {
        await drainNotifications(runner);
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
        void drainNotifications(runner);
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
    setNotifier(nextNotifier) {
      notifier = nextNotifier;
    },
    get isRunning() {
      return running;
    },
    run
  };
}
