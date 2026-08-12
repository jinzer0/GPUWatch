import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HELPER_PATH_ENV, createHelperRunner, type HelperRunner } from './helperRunner.js';
import { createScheduler } from './scheduler.js';

const helperPath = path.join(process.cwd(), 'crates', 'gpuwatcher-helper', 'target', 'debug', 'gpuwatcher-helper');
const fakeSshOutput = `__GPUWATCH_SECTION__:hostname:0
gpu-host
__GPUWATCH_END__:hostname
__GPUWATCH_SECTION__:gpu_csv:0
0, GPU-aaaa, 00000000:65:00.0, NVIDIA A100-SXM4-40GB, 535.129.03, 40960, 512, 40448, 0, 1, 41, 100.00, 400.00, 30, 1410, 1215
__GPUWATCH_END__:gpu_csv
__GPUWATCH_SECTION__:compute_apps_csv:9
compute-apps unavailable
__GPUWATCH_END__:compute_apps_csv
__GPUWATCH_SECTION__:gpu_extra_csv:9
gpu extra unavailable
__GPUWATCH_END__:gpu_extra_csv
__GPUWATCH_SECTION__:mig_list:9
mig unavailable
__GPUWATCH_END__:mig_list
__GPUWATCH_SECTION__:pmon:9
pmon unavailable
__GPUWATCH_END__:pmon
__GPUWATCH_SECTION__:dmon:9
dmon unavailable
__GPUWATCH_END__:dmon
__GPUWATCH_SECTION__:dmon_pcie:9
dmon pcie unavailable
__GPUWATCH_END__:dmon_pcie
__GPUWATCH_SECTION__:ps:9
ps unavailable
__GPUWATCH_END__:ps
`;

const temporaryDirectories: string[] = [];

async function createFakeSshDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'gpuwatcher-scheduler-helper-'));
  temporaryDirectories.push(directory);
  const sshPath = path.join(directory, 'ssh');
  await writeFile(sshPath, `#!/bin/sh
cat >/dev/null
cat <<'GPUWATCHER_FAKE_SSH'
${fakeSshOutput}GPUWATCHER_FAKE_SSH
`);
  await chmod(sshPath, 0o755);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Electron scheduler helper integration', () => {
  it('delivers one real refresh outbox event through the main-only helper action without duplication', async () => {
    const fakeSshDirectory = await createFakeSshDirectory();
    const dataDirectory = await mkdtemp(path.join(tmpdir(), 'gpuwatcher-scheduler-data-'));
    temporaryDirectories.push(dataDirectory);
    const runner = createHelperRunner({
      env: {
        [HELPER_PATH_ENV]: helperPath,
        GPUWATCHER_TEST_DATA_DIR: dataDirectory,
        PATH: `${fakeSshDirectory}:${process.env.PATH ?? ''}`
      }
    });
    const helperActions: string[] = [];
    const recordingRunner: HelperRunner = {
      run(request) {
        helperActions.push(request.action);
        return runner.run(request);
      }
    };

    const savedServer = await recordingRunner.run<{ input: object }, { id: string }>({
      action: 'save_server',
      payload: {
        input: {
          id: null,
          name: 'Integration GPU Host',
          host: 'integration.example.test',
          port: 22,
          username: 'gpu',
          sshKeyPath: null,
          pollingIntervalSeconds: 30,
          enabled: true
        }
      }
    });
    expect(savedServer.ok).toBe(true);
    if (!savedServer.ok) {
      return;
    }

    await expect(recordingRunner.run({
      action: 'save_gpu_available_watch',
      payload: {
        input: {
          id: null,
          serverId: savedServer.data.id,
          gpuUuid: 'GPU-aaaa',
          gpuIndex: 0,
          enabled: true,
          utilizationThresholdPercent: 5,
          memoryThresholdMiB: 1024,
          sustainSeconds: 0,
          cooldownSeconds: 0
        }
      }
    })).resolves.toMatchObject({ ok: true });

    const show = vi.fn();
    const scheduler = createScheduler({ notifier: { show } });
    scheduler.start();

    await expect(scheduler.run(recordingRunner, { action: 'refresh_server', payload: { id: savedServer.data.id } })).resolves.toMatchObject({
      ok: true,
      data: { ok: true, status: 'online' }
    });
    expect(show).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledWith({ title: 'GPU available', body: 'Integration GPU Host · GPU 0 is available' });

    await expect(scheduler.run(recordingRunner, { action: 'refresh_server', payload: { id: savedServer.data.id } })).resolves.toMatchObject({
      ok: true,
      data: { ok: true, status: 'online' }
    });
    expect(show).toHaveBeenCalledOnce();
    expect(helperActions.filter((action) => action === 'consume_notification_events')).toHaveLength(2);
    scheduler.stop();
  });
});
