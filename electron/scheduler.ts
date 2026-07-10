import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from './helperContract.js';
import { HELPER_TIMEOUT_MS, type HelperRunner } from './helperRunner.js';
import { contractError } from './scheduler/contract.js';
import { runGuardedHelperAction, type SchedulerGuardState } from './scheduler/guards.js';
import { runPollTick } from './scheduler/pollingLoop.js';
export type { ElectronSchedulerOptions } from './scheduler/types.js';
import type { ElectronSchedulerOptions } from './scheduler/types.js';

export interface ElectronScheduler {
  start(runner?: HelperRunner): void;
  stop(): void;
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

    return runGuardedHelperAction(guardState, pollConcurrency, runner, request);
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
