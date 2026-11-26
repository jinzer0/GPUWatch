import { ipcMain } from 'electron';

import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from './helperContract.js';
import type { HelperRunner } from './helperRunner.js';
import type { ElectronScheduler } from './scheduler.js';
import type { UiIpcOptions } from './uiIpc.js';
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

export function registerIpcHandlers(
  runner: HelperRunner,
  scheduler: ElectronScheduler,
  authorization: Pick<UiIpcOptions, 'getWindows' | 'isAllowedUrl'>
): void {
  for (const entry of helperIpcChannels) {
    ipcMain.handle(entry.channel, async (event, payload: unknown) => {
      const authorized = authorization.getWindows().some((window) =>
        !window.isDestroyed()
        && !window.webContents.isDestroyed()
        && window.webContents === event.sender
        && event.senderFrame != null
        && event.senderFrame === window.webContents.mainFrame
        && authorization.isAllowedUrl(event.senderFrame.url)
      );
      if (!authorized) {
        return {
          ok: false,
          error: {
            layer: 'helper_contract',
            type: 'ipc_forbidden',
            message: 'Helper requests require an allowed application main frame.'
          }
        };
      }
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
