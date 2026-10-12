import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScheduler as createRealScheduler, type ElectronScheduler } from './scheduler.js';
import type { HelperRunner } from './helperRunner.js';

const schedulers: ElectronScheduler[] = [];

function createScheduler(...args: Parameters<typeof createRealScheduler>): ElectronScheduler {
  const scheduler = createRealScheduler(...args);
  schedulers.push(scheduler);
  return scheduler;
}

afterEach(() => {
  for (const scheduler of schedulers.splice(0)) scheduler.stop();
});

function withStartupReset(runner: HelperRunner, guardOnly = false): HelperRunner {
  return {
    cancelActive: () => runner.cancelActive?.(),
    run(request) {
      if (request.action === 'reset_availability_observations' || (guardOnly && (request.action === 'list_servers' || request.action === 'consume_notification_events'))) {
        return Promise.resolve({ ok: true, data: [] });
      }
      return runner.run(request);
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

async function waitForCondition(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 1000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  throw lastError;
}

describe('Electron scheduler', () => {
  it('returns a structured error while stopped instead of running the helper', async () => {
    const runner: HelperRunner = {
      async run() {
        return { ok: true, data: {} };
      }
    };
    const scheduler = createScheduler();

    await expect(scheduler.run(runner, { action: 'health', payload: {} })).resolves.toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'scheduler_stopped',
        message: 'Electron helper scheduler is not running.'
      }
    });
  });

  it('serializes DB-mutating helper calls', async () => {
    let active = 0;
    let maxActive = 0;
    const releaseFirst = deferred<void>();
    const runner: HelperRunner = {
      async run() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (active === 1) {
          await releaseFirst.promise;
        }
        active -= 1;
        return { ok: true, data: {} };
      }
    };
    const scheduler = createScheduler();
    await scheduler.start(withStartupReset(runner, true));

    const first = scheduler.run(runner, { action: 'seed_demo_data', payload: {} });
    const second = scheduler.run(runner, { action: 'seed_demo_data', payload: {} });
    await Promise.resolve();

    expect(maxActive).toBe(1);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
  });

  it('discards pending notifications without displaying them when the scheduler starts', async () => {
    const show = vi.fn();
    let consumes = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'consume_notification_events') {
          consumes += 1;
          return {
            ok: true,
            data: [{ id: 'event-startup', ruleId: 'rule-1', serverId: 'server-1', eventType: 'gpu_available', title: 'GPU available', body: 'GPU 0 is available', createdAt: '2026-06-07T00:00:00Z' }]
          };
        }
        if (request.action === 'list_servers') {
          return { ok: true, data: [] };
        }
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ notifier: { show }, pollIntervalMs: 60_000 });

    await scheduler.start(withStartupReset(runner));

    expect(show).not.toHaveBeenCalled();
    expect(consumes).toBe(1);
    scheduler.stop();
  });

  it('does not hold unrelated settings writes behind a long SSH refresh', async () => {
    const releaseRefresh = deferred<void>();
    const actions: string[] = [];
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'refresh_server') {
          await releaseRefresh.promise;
        }
        return { ok: true, data: { action: request.action } };
      }
    };
    const scheduler = createScheduler();
    await scheduler.start(withStartupReset(runner, true));

    const refresh = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await waitForCondition(() => expect(actions).toEqual(['refresh_server']));

    const save = await scheduler.run(runner, {
      action: 'save_server',
      payload: { input: { id: 'server-2', name: 'Other' } }
    });

    expect(save).toEqual({ ok: true, data: { action: 'save_server' } });
    expect(actions).toEqual(['refresh_server', 'save_server']);
    releaseRefresh.resolve();
    await refresh;
  });

  it('allows same-server settings writes during refresh and relies on stale poll discard', async () => {
    const releaseRefresh = deferred<void>();
    const actions: string[] = [];
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'refresh_server') {
          await releaseRefresh.promise;
          return {
            ok: true,
            data: { ok: false, status: 'stale_discarded', errorType: 'stale_poll_discarded', message: 'discarded' }
          };
        }
        return { ok: true, data: { action: request.action } };
      }
    };
    const scheduler = createScheduler();
    await scheduler.start(withStartupReset(runner, true));

    const refresh = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await waitForCondition(() => expect(actions).toEqual(['refresh_server']));
    const save = await scheduler.run(runner, {
      action: 'save_server',
      payload: { input: { id: 'server-1', name: 'Edited' } }
    });

    expect(save.ok).toBe(true);
    expect(actions).toEqual(['refresh_server', 'save_server']);
    releaseRefresh.resolve();
    await expect(refresh).resolves.toEqual({
      ok: true,
      data: { ok: false, status: 'stale_discarded', errorType: 'stale_poll_discarded', message: 'discarded' }
    });
  });

  it('prevents same-server overlap between refresh_server and test_connection', async () => {
    const releaseRefresh = deferred<void>();
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          await releaseRefresh.promise;
        }
        return { ok: true, data: { action: request.action } };
      }
    };
    const scheduler = createScheduler();
    await scheduler.start(withStartupReset(runner, true));

    const refresh = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await Promise.resolve();
    const overlapped = await scheduler.run(runner, { action: 'test_connection', payload: { id: 'server-1' } });

    expect(overlapped).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'poll_already_running',
        message: 'poll already running for this server or global network cap reached'
      }
    });
    releaseRefresh.resolve();
    await refresh;
  });

  it('allows simultaneous poll actions for different servers', async () => {
    const release = deferred<void>();
    let active = 0;
    let maxActive = 0;
    const runner: HelperRunner = {
      async run() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await release.promise;
        active -= 1;
        return { ok: true, data: {} };
      }
    };
    const scheduler = createScheduler();
    await scheduler.start(withStartupReset(runner, true));

    const first = scheduler.run(runner, { action: 'test_connection', payload: { id: 'server-1' } });
    const second = scheduler.run(runner, { action: 'test_connection', payload: { id: 'server-2' } });
    await Promise.resolve();

    expect(maxActive).toBe(2);
    release.resolve();
    await Promise.all([first, second]);
  });

  it('applies the global network cap to manual different-server refreshes', async () => {
    const release = deferred<void>();
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          await release.promise;
        }
        return { ok: true, data: {} };
      }
    };
    const scheduler = createScheduler({ pollConcurrency: 1 });
    await scheduler.start(withStartupReset(runner, true));

    const first = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await Promise.resolve();
    const capped = await scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } });

    expect(capped).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'poll_already_running',
        message: 'poll already running for this server or global network cap reached'
      }
    });
    release.resolve();
    await first;
  });

  it('releases same-server and global slots after a helper success response', async () => {
    let refreshCalls = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          refreshCalls += 1;
        }
        return { ok: true, data: { ok: true, status: 'online', errorType: null, message: 'snapshot stored' } };
      }
    };
    const scheduler = createScheduler({ pollConcurrency: 1 });
    await scheduler.start(withStartupReset(runner, true));

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: true });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: true });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } })).resolves.toMatchObject({ ok: true });

    expect(refreshCalls).toBe(3);
  });

  it('releases same-server and global slots after a helper error response', async () => {
    let refreshCalls = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          refreshCalls += 1;
        }
        return { ok: false, error: { layer: 'helper_process', type: 'helper_failed', message: 'helper failed' } };
      }
    };
    const scheduler = createScheduler({ pollConcurrency: 1 });
    await scheduler.start(withStartupReset(runner, true));

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: false });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: false });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } })).resolves.toMatchObject({ ok: false });

    expect(refreshCalls).toBe(3);
  });

  it('drains and displays pending notifications after a manual refresh while preserving its response', async () => {
    const show = vi.fn();
    let consumes = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          return { ok: false, error: { layer: 'transport_ssh', type: 'connection_failed', message: 'offline' } };
        }
        if (request.action === 'consume_notification_events') {
          consumes += 1;
          return consumes === 1 ? {
            ok: true,
            data: [{ id: 'event-1', ruleId: 'rule-1', serverId: 'server-1', eventType: 'gpu_available', title: 'GPU available', body: 'GPU 0 is available', createdAt: '2026-06-07T00:00:00Z' }]
          } : { ok: true, data: [] };
        }
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ notifier: { show } });
    await scheduler.start(withStartupReset(runner, true));

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toEqual({
      ok: false,
      error: { layer: 'transport_ssh', type: 'connection_failed', message: 'offline' }
    });
    expect(show).toHaveBeenCalledWith({ title: 'GPU available', body: 'GPU 0 is available' });
    await scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    expect(show).toHaveBeenCalledTimes(1);
    expect(consumes).toBe(2);
  });

  it('isolates consume and notifier failures so future refreshes still run', async () => {
    let refreshes = 0;
    let consumes = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          refreshes += 1;
          return { ok: true, data: { refreshed: refreshes } };
        }
        if (request.action === 'consume_notification_events') {
          consumes += 1;
          if (consumes === 1) {
            throw new Error('consume failed');
          }
          return { ok: true, data: [{ id: 'event-2', ruleId: 'rule-1', serverId: 'server-1', eventType: 'gpu_available', title: 'GPU available', body: 'GPU 1 is available', createdAt: '2026-06-07T00:00:00Z' }] };
        }
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ notifier: { show: () => { throw new Error('notification failed'); } } });
    await scheduler.start(withStartupReset(runner, true));

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toEqual({ ok: true, data: { refreshed: 1 } });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toEqual({ ok: true, data: { refreshed: 2 } });
    expect(refreshes).toBe(2);
    expect(consumes).toBe(2);
  });

  it('releases same-server and global slots after a rejected helper run', async () => {
    let first = true;
    const runner: HelperRunner = {
      async run() {
        if (first) {
          first = false;
          throw new Error('helper runner rejected');
        }
        return { ok: true, data: { ok: true, status: 'online', errorType: null, message: 'snapshot stored' } };
      }
    };
    const scheduler = createScheduler({ pollConcurrency: 1 });
    await scheduler.start(withStartupReset(runner, true));

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).rejects.toThrow('helper runner rejected');
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: true });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } })).resolves.toMatchObject({ ok: true });
  });

  it('cancels active helper work when the scheduler stops', async () => {
    let cancelled = 0;
    const runner: HelperRunner = {
      cancelActive() {
        cancelled += 1;
      },
      async run() {
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000 });

    const starting = scheduler.start(withStartupReset(runner));
    scheduler.stop();
    await starting;

    expect(cancelled).toBe(1);
  });

  it('cancels active helper work once and allows the server after restart', async () => {
    const cancelledRefresh = deferred<never>();
    let cancelled = 0;
    let refreshCalls = 0;
    const runner: HelperRunner = {
      cancelActive() {
        cancelled += 1;
        cancelledRefresh.reject(new Error('cancelled'));
      },
      async run(request) {
        if (request.action === 'refresh_server') {
          refreshCalls += 1;
          if (refreshCalls === 1) {
            return cancelledRefresh.promise;
          }
        }
        return { ok: true, data: { ok: true, status: 'online', errorType: null, message: 'snapshot stored' } };
      }
    };
    const scheduler = createScheduler({ pollConcurrency: 1 });
    await scheduler.start(withStartupReset(runner, true));

    const refresh = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await waitForCondition(() => expect(refreshCalls).toBe(1));

    scheduler.stop();
    await expect(refresh).rejects.toThrow('cancelled');
    await scheduler.start(withStartupReset(runner, true));

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: true });
    expect(cancelled).toBe(1);
    expect(refreshCalls).toBe(2);
  });

  it('polls only due enabled servers from Electron main and leaves poll_due_servers off the helper surface', async () => {
    const actions: Array<{ action: string; payload: object }> = [];
    const runner: HelperRunner = {
      async run(request) {
        actions.push({ action: request.action, payload: request.payload });
        if (request.action === 'list_servers') {
          return {
            ok: true,
            data: [
              { id: 'due-never-polled', enabled: true, pollingIntervalSeconds: 30 },
              { id: 'not-due', enabled: true, pollingIntervalSeconds: 30 },
              { id: 'disabled', enabled: false, pollingIntervalSeconds: 30 },
              { id: 'config-changed', enabled: true, pollingIntervalSeconds: 30 }
            ]
          };
        }
        if (request.action === 'get_server_detail') {
          const id = (request.payload as { id: string }).id;
          if (id === 'not-due') {
            return {
              ok: true,
              data: {
                health: {
                  status: 'online',
                  lastPollStartedAt: null,
                  lastPollFinishedAt: '2026-06-07T00:01:20.000Z',
                  lastSuccessAt: '2026-06-07T00:01:20.000Z'
                }
              }
            };
          }
          return { ok: true, data: { health: { status: 'idle', lastPollStartedAt: null, lastPollFinishedAt: null, lastSuccessAt: null } } };
        }
        if (request.action === 'refresh_server') {
          const id = (request.payload as { id: string }).id;
          return {
            ok: true,
            data:
              id === 'config-changed'
                ? { ok: false, status: 'stale_discarded', errorType: 'stale_poll_discarded', message: 'discarded' }
                : { ok: true, status: 'online', errorType: null, message: 'snapshot stored' }
          };
        }
        if (request.action === 'consume_notification_events') return { ok: true, data: [] };
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000, now: () => new Date('2026-06-07T00:01:31.000Z') });

    await scheduler.start(withStartupReset(runner));

    await waitForCondition(() => {
      expect(actions.filter((entry) => entry.action === 'refresh_server').map((entry) => (entry.payload as { id: string }).id)).toEqual([
        'due-never-polled',
        'config-changed'
      ]);
    });
    expect(actions.map((entry) => entry.action)).not.toContain('poll_due_servers');
    scheduler.stop();
  });

  it('drains notifications after scheduled refreshes', async () => {
    const show = vi.fn();
    let refreshed = false;
    let consumes = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'list_servers') {
          return { ok: true, data: [{ id: 'server-1', enabled: true, pollingIntervalSeconds: 30 }] };
        }
        if (request.action === 'get_server_detail') {
          return { ok: true, data: { health: { status: 'idle', lastPollStartedAt: null, lastPollFinishedAt: null, lastSuccessAt: null } } };
        }
        if (request.action === 'refresh_server') {
          refreshed = true;
          return { ok: true, data: { ok: true, status: 'online', errorType: null, message: 'snapshot stored' } };
        }
        if (request.action === 'consume_notification_events') {
          consumes += 1;
          return refreshed && consumes === 2
            ? { ok: true, data: [{ id: 'event-scheduled', ruleId: 'rule-1', serverId: 'server-1', eventType: 'gpu_available', title: 'GPU available', body: 'GPU 0 is available', createdAt: '2026-06-07T00:00:00Z' }] }
            : { ok: true, data: [] };
        }
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ notifier: { show }, pollIntervalMs: 60_000, now: () => new Date('2026-06-07T00:00:00.000Z') });

    await scheduler.start(withStartupReset(runner));

    await waitForCondition(() => expect(show).toHaveBeenCalledWith({ title: 'GPU available', body: 'GPU 0 is available' }));
    expect(show).toHaveBeenCalledTimes(1);
    expect(consumes).toBe(2);
    scheduler.stop();
  });

  it('queues concurrent refresh drains and displays each consumed event exactly once', async () => {
    const show = vi.fn();
    const releaseFirstConsume = deferred<void>();
    let consumes = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'refresh_server') {
          return { ok: true, data: { ok: true } };
        }
        if (request.action === 'consume_notification_events') {
          consumes += 1;
          if (consumes === 1) {
            await releaseFirstConsume.promise;
            return { ok: true, data: [{ id: 'event-1', ruleId: 'rule-1', serverId: 'server-1', eventType: 'gpu_available', title: 'first', body: 'one', createdAt: '2026-06-07T00:00:00Z' }] };
          }
          return consumes === 2
            ? { ok: true, data: [{ id: 'event-2', ruleId: 'rule-2', serverId: 'server-2', eventType: 'gpu_available', title: 'second', body: 'two', createdAt: '2026-06-07T00:00:00Z' }] }
            : { ok: true, data: [] };
        }
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ notifier: { show } });
    await scheduler.start(withStartupReset(runner, true));

    const first = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await waitForCondition(() => expect(consumes).toBe(1));
    const second = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } });
    releaseFirstConsume.resolve();

    await Promise.all([first, second]);
    expect(consumes).toBe(2);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenNthCalledWith(1, { title: 'first', body: 'one' });
    expect(show).toHaveBeenNthCalledWith(2, { title: 'second', body: 'two' });
  });

  it('limits scheduled polling concurrency across different due servers', async () => {
    const releaseRefresh = deferred<void>();
    let active = 0;
    let maxActive = 0;
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'list_servers') {
          return {
            ok: true,
            data: [
              { id: 'server-1', enabled: true, pollingIntervalSeconds: 1 },
              { id: 'server-2', enabled: true, pollingIntervalSeconds: 1 },
              { id: 'server-3', enabled: true, pollingIntervalSeconds: 1 }
            ]
          };
        }
        if (request.action === 'get_server_detail') {
          return { ok: true, data: { health: { status: 'idle', lastPollStartedAt: null, lastPollFinishedAt: null, lastSuccessAt: null } } };
        }
        if (request.action === 'refresh_server') {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await releaseRefresh.promise;
          active -= 1;
          return { ok: true, data: { ok: true, status: 'online', errorType: null, message: 'snapshot stored' } };
        }
        if (request.action === 'consume_notification_events') return { ok: true, data: [] };
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000, pollConcurrency: 2, now: () => new Date('2026-06-07T00:00:00.000Z') });

    await scheduler.start(withStartupReset(runner));
    await waitForCondition(() => expect(maxActive).toBe(2));
    expect(active).toBe(2);
    releaseRefresh.resolve();
    await waitForCondition(() => expect(active).toBe(0));
    expect(maxActive).toBe(2);
    scheduler.stop();
  });

  it('recovers servers stuck in polling after a stale helper timeout window', async () => {
    const refreshed: string[] = [];
    const runner: HelperRunner = {
      async run(request) {
        if (request.action === 'list_servers') {
          return { ok: true, data: [{ id: 'stale-polling', enabled: true, pollingIntervalSeconds: 30 }] };
        }
        if (request.action === 'get_server_detail') {
          return {
            ok: true,
            data: {
              health: {
                status: 'polling',
                lastPollStartedAt: '2026-06-07T00:00:00.000Z',
                lastPollFinishedAt: null,
                lastSuccessAt: null
              }
            }
          };
        }
        if (request.action === 'refresh_server') {
          refreshed.push((request.payload as { id: string }).id);
          return { ok: true, data: { ok: true, status: 'online', errorType: null, message: 'snapshot stored' } };
        }
        if (request.action === 'consume_notification_events') return { ok: true, data: [] };
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({
      pollIntervalMs: 60_000,
      stalePollingMs: 1000,
      now: () => new Date('2026-06-07T00:00:02.000Z')
    });

    await scheduler.start(withStartupReset(runner));

    await waitForCondition(() => expect(refreshed).toEqual(['stale-polling']));
    scheduler.stop();
  });

  it('discards the old outbox then gates startup collection until reset succeeds', async () => {
    const reset = deferred<void>();
    const actions: string[] = [];
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'reset_availability_observations') await reset.promise;
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000 });
    const starting = scheduler.start(runner);
    await waitForCondition(() => expect(actions).toEqual(['consume_notification_events', 'reset_availability_observations']));
    expect(scheduler.isRunning).toBe(false);
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 's' } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    await expect(scheduler.run(runner, { action: 'save_server', payload: { input: {} } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    await expect(scheduler.run(runner, { action: 'get_server_detail', payload: { id: 's' } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    await expect(scheduler.run(runner, { action: 'health', payload: {} })).resolves.toMatchObject({ ok: true });
    expect(actions.filter((action) => action === 'consume_notification_events')).toHaveLength(1);
    reset.resolve();
    await starting;
    expect(scheduler.isRunning).toBe(true);
    expect(actions.indexOf('consume_notification_events')).toBeLessThan(actions.indexOf('reset_availability_observations'));
    scheduler.stop();
  });

  it.each(['envelope', 'rejection'])('fails closed on a startup reset %s error', async (failure) => {
    const actions: string[] = [];
    const show = vi.fn();
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'consume_notification_events') return { ok: true, data: [] };
        if (request.action === 'health' || request.action === 'list_servers' || request.action === 'list_watch_rules') return { ok: true, data: [] };
        if (failure === 'rejection') throw new Error('reset unavailable');
        return { ok: false, error: { layer: 'helper_contract', type: 'reset_failed', message: 'reset unavailable' } };
      }
    };
    const scheduler = createScheduler({ notifier: { show } });
    await expect(scheduler.start(runner)).rejects.toThrow('reset unavailable');
    await expect(scheduler.start(runner)).rejects.toThrow('reset unavailable');
    expect(scheduler.isRunning).toBe(false);
    await expect(scheduler.run(runner, { action: 'test_connection', payload: { id: 's' } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    await expect(scheduler.run(runner, { action: 'get_server_detail', payload: { id: 's' } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    expect(actions).toEqual(['consume_notification_events', 'reset_availability_observations']);
    await expect(scheduler.run(runner, { action: 'health', payload: {} })).resolves.toMatchObject({ ok: true });
    await expect(scheduler.run(runner, { action: 'list_servers', payload: {} })).resolves.toMatchObject({ ok: true });
    await expect(scheduler.run(runner, { action: 'list_watch_rules', payload: { serverId: 's' } })).resolves.toMatchObject({ ok: true });
    expect(scheduler.isRunning).toBe(false);
    expect(show).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('orders suspend and concurrent resume behind renderer refresh, test and queued writes', async () => {
    const refresh = deferred<void>();
    const test = deferred<void>();
    const write = deferred<void>();
    const actions: string[] = [];
    const show = vi.fn();
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'refresh_server') await refresh.promise;
        if (request.action === 'test_connection') await test.promise;
        if (request.action === 'save_server') await write.promise;
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ notifier: { show }, pollIntervalMs: 60_000 });
    await scheduler.start(runner);
    const refreshing = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'a' } });
    const testing = scheduler.run(runner, { action: 'test_connection', payload: { id: 'b' } });
    const saving = scheduler.run(runner, { action: 'save_server', payload: { input: {} } });
    const queuedWrite = scheduler.run(runner, { action: 'seed_demo_data', payload: {} });
    await waitForCondition(() => expect(actions).toContain('save_server'));
    const suspended = scheduler.suspend();
    const resumed = scheduler.resume();
    expect(scheduler.isRunning).toBe(false);
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'c' } })).resolves.toMatchObject({ ok: false });
    refresh.resolve();
    test.resolve();
    await Promise.all([refreshing, testing]);
    expect(actions.filter((action) => action === 'reset_availability_observations')).toHaveLength(1);
    write.resolve();
    await Promise.all([saving, queuedWrite, suspended, resumed]);
    expect(actions.filter((action) => action === 'reset_availability_observations')).toHaveLength(3);
    expect(actions.lastIndexOf('seed_demo_data')).toBeLessThan(actions.lastIndexOf('reset_availability_observations'));
    expect(actions.filter((action) => action === 'consume_notification_events')).toHaveLength(3);
    expect(scheduler.isRunning).toBe(true);
    expect(show).not.toHaveBeenCalled();
    await scheduler.suspend();
    expect(scheduler.isRunning).toBe(false);
    await scheduler.resume();
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
  });

  it('fences stop, restart and old timer callbacks while reset is pending', async () => {
    const reset = deferred<void>();
    const callbacks: (() => void)[] = [];
    const actions: string[] = [];
    let resets = 0;
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'reset_availability_observations' && ++resets === 2) await reset.promise;
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({
      setIntervalFn: ((callback: () => void) => { callbacks.push(callback); return callbacks.length; }) as unknown as typeof setInterval,
      clearIntervalFn: vi.fn()
    });
    await scheduler.start(runner);
    const resuming = scheduler.resume();
    await waitForCondition(() => expect(resets).toBe(2));
    scheduler.stop();
    const restarting = scheduler.start(runner);
    const before = actions.length;
    callbacks[0]();
    expect(actions).toHaveLength(before);
    reset.resolve();
    await Promise.all([resuming, restarting]);
    expect(resets).toBe(3);
    expect(callbacks).toHaveLength(2);
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
    const stopped = actions.length;
    callbacks[1]();
    expect(actions).toHaveLength(stopped);
  });

  it('does not turn a pre-suspend scheduled server list into a post-reset refresh', async () => {
    const list = deferred<void>();
    const actions: string[] = [];
    let lists = 0;
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'list_servers' && ++lists === 1) {
          await list.promise;
          return { ok: true, data: [{ id: 'old', enabled: true, pollingIntervalSeconds: 1 }] };
        }
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000 });
    await scheduler.start(runner);
    await waitForCondition(() => expect(lists).toBe(1));
    const suspended = scheduler.suspend();
    list.resolve();
    await suspended;
    expect(actions).not.toContain('refresh_server');
    expect(actions).not.toContain('get_server_detail');
    expect(scheduler.isRunning).toBe(false);
    await scheduler.resume();
    expect(lists).toBe(2);
    expect(actions).not.toContain('refresh_server');
    scheduler.stop();
  });

  it('discards startup and in-flight suspend events but shows a later fresh event exactly once', async () => {
    const release = deferred<void>();
    const stale = { title: 'GPU available', body: 'stale observation' };
    const fresh = { title: 'GPU available', body: 'fresh qualified observation' };
    let outbox = [stale];
    let refreshes = 0;
    const actions: string[] = [];
    const show = vi.fn();
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'refresh_server') {
          if (++refreshes === 1) {
            await release.promise;
            outbox.push(stale);
          } else if (refreshes === 2) {
            outbox.push(fresh);
          }
        }
        if (request.action === 'consume_notification_events') {
          const events = outbox;
          outbox = [];
          return { ok: true, data: events };
        }
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ notifier: { show }, pollIntervalMs: 60_000 });
    await scheduler.start(runner);
    expect(outbox).toEqual([]);
    expect(actions.slice(0, 2)).toEqual(['consume_notification_events', 'reset_availability_observations']);
    expect(show).not.toHaveBeenCalled();
    const refreshing = scheduler.run(runner, { action: 'refresh_server', payload: { id: 's' } });
    const suspended = scheduler.suspend();
    const resumed = scheduler.resume();
    release.resolve();
    await Promise.all([refreshing, suspended, resumed]);
    expect(outbox).toEqual([]);
    expect(show).not.toHaveBeenCalled();
    await scheduler.run(runner, { action: 'refresh_server', payload: { id: 's' } });
    await scheduler.run(runner, { action: 'refresh_server', payload: { id: 's' } });
    expect(show).toHaveBeenCalledExactlyOnceWith(fresh);
    scheduler.stop();
  });

  it.each(['envelope', 'rejection', 'malformed'])('fails closed when pending notification discard has a %s failure', async (failure) => {
    const actions: string[] = [];
    const show = vi.fn();
    let failDiscard = true;
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'consume_notification_events' && failDiscard) {
          if (failure === 'rejection') throw new Error('discard unavailable');
          if (failure === 'malformed') return { ok: true, data: {} };
          return { ok: false, error: { layer: 'helper_contract', type: 'consume_failed', message: 'discard unavailable' } };
        }
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ notifier: { show }, pollIntervalMs: 60_000 });
    await expect(scheduler.start(runner)).rejects.toThrow();
    expect(scheduler.isRunning).toBe(false);
    expect(actions).toEqual(['consume_notification_events']);
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 's' } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    failDiscard = false;
    await scheduler.resume();
    expect(scheduler.isRunning).toBe(true);
    failDiscard = true;
    await expect(scheduler.suspend()).rejects.toThrow();
    expect(scheduler.isRunning).toBe(false);
    await expect(scheduler.resume()).rejects.toThrow();
    expect(actions.filter((action) => action === 'reset_availability_observations')).toHaveLength(1);
    expect(show).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('keeps resume failure closed until an explicit successful retry', async () => {
    let resets = 0;
    const actions: string[] = [];
    const runner: HelperRunner = {
      async run(request) {
        actions.push(request.action);
        if (request.action === 'reset_availability_observations' && ++resets === 3) throw new Error('resume reset failed');
        return { ok: true, data: [] };
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000 });
    await scheduler.start(runner);
    await scheduler.suspend();
    const consumes = actions.filter((action) => action === 'consume_notification_events').length;
    await expect(scheduler.resume()).rejects.toThrow('resume reset failed');
    expect(scheduler.isRunning).toBe(false);
    await expect(scheduler.run(runner, { action: 'test_connection', payload: { id: 's' } })).resolves.toMatchObject({ ok: false, error: { type: 'scheduler_not_ready' } });
    expect(actions.filter((action) => action === 'consume_notification_events')).toHaveLength(consumes + 1);
    await scheduler.resume();
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
  });
});
