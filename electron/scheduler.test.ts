import { describe, expect, it } from 'vitest';

import { createScheduler } from './scheduler.js';
import type { HelperRunner } from './helperRunner.js';

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
    scheduler.start();

    const first = scheduler.run(runner, { action: 'seed_demo_data', payload: {} });
    const second = scheduler.run(runner, { action: 'seed_demo_data', payload: {} });
    await Promise.resolve();

    expect(maxActive).toBe(1);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
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
    scheduler.start();

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

  it('allows same-server settings writes during refresh so stale poll results can be discarded by config revision', async () => {
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
    scheduler.start();

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
    scheduler.start();

    const refresh = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await Promise.resolve();
    const overlapped = await scheduler.run(runner, { action: 'test_connection', payload: { id: 'server-1' } });

    expect(overlapped).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'poll_already_running',
        message: 'poll already running for this server or same-server mutation is queued'
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
    scheduler.start();

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
    scheduler.start();

    const first = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await Promise.resolve();
    const capped = await scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } });

    expect(capped).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'poll_already_running',
        message: 'poll already running for this server or same-server mutation is queued'
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
    scheduler.start();

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
    scheduler.start();

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: false });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: false });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } })).resolves.toMatchObject({ ok: false });

    expect(refreshCalls).toBe(3);
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
    scheduler.start();

    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).rejects.toThrow('helper runner rejected');
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } })).resolves.toMatchObject({ ok: true });
    await expect(scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-2' } })).resolves.toMatchObject({ ok: true });
  });

  it('cancels active helper work when the scheduler stops', () => {
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

    scheduler.start(runner);
    scheduler.stop();

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
    scheduler.start(runner);

    const refresh = scheduler.run(runner, { action: 'refresh_server', payload: { id: 'server-1' } });
    await waitForCondition(() => expect(refreshCalls).toBe(1));

    scheduler.stop();
    await expect(refresh).rejects.toThrow('cancelled');
    scheduler.start();

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
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000, now: () => new Date('2026-06-07T00:01:31.000Z') });

    scheduler.start(runner);

    await waitForCondition(() => {
      expect(actions.filter((entry) => entry.action === 'refresh_server').map((entry) => (entry.payload as { id: string }).id)).toEqual([
        'due-never-polled',
        'config-changed'
      ]);
    });
    expect(actions.map((entry) => entry.action)).not.toContain('poll_due_servers');
    scheduler.stop();
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
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({ pollIntervalMs: 60_000, pollConcurrency: 2, now: () => new Date('2026-06-07T00:00:00.000Z') });

    scheduler.start(runner);
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
        throw new Error(`unexpected action ${request.action}`);
      }
    };
    const scheduler = createScheduler({
      pollIntervalMs: 60_000,
      stalePollingMs: 1000,
      now: () => new Date('2026-06-07T00:00:02.000Z')
    });

    scheduler.start(runner);

    await waitForCondition(() => expect(refreshed).toEqual(['stale-polling']));
    scheduler.stop();
  });
});
