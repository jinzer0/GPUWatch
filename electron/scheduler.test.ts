import { describe, expect, it } from 'vitest';

import { createScheduler } from './scheduler.js';
import type { HelperRunner } from './helperRunner.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
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
});
