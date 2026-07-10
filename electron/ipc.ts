import { ipcMain } from 'electron';

import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from './helperContract.js';
import { createHelperRunner, type HelperRunner } from './helperRunner.js';
import { createScheduler, type ElectronScheduler } from './scheduler.js';
export { IPC_CHANNEL_PREFIX, channelForPreloadMethod, helperIpcChannels } from './ipc/actionChannels.js';
import { helperIpcChannels } from './ipc/actionChannels.js';
export { validateHelperPayload } from './ipc/payloadValidation.js';
import { validateHelperPayload } from './ipc/payloadValidation.js';

export const IPC_SCAFFOLD_STATUS = {
  ipcHandlers: 'implemented-task-7',
  helperRunner: 'implemented-task-8',
  scheduler: 'implemented-task-8'
} as const;

export async function invokeHelperAction(
  runner: HelperRunner,
  request: HelperRequestEnvelope<HelperAction, object>,
  scheduler?: ElectronScheduler
): Promise<HelperResponseEnvelope> {
  try {
    return scheduler ? await scheduler.run(runner, request) : await runner.run(request);
  } catch (error) {
    return {
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'helper_runner_error',
        message: error instanceof Error ? error.message : 'Helper runner failed before returning a response envelope.'
      }
    };
  }
}

export function registerIpcHandlers(runner: HelperRunner = createHelperRunner(), scheduler: ElectronScheduler = createScheduler()): void {
  for (const entry of helperIpcChannels) {
    ipcMain.handle(entry.channel, async (_event, payload: unknown) => {
      const validation = validateHelperPayload(entry.action, payload);
      if (!validation.ok) {
        return validation;
      }

      return invokeHelperAction(
        runner,
        {
          action: entry.action,
          payload: validation.data
        },
        scheduler
      );
    });
  }
}

export const registerIpcScaffold = registerIpcHandlers;
