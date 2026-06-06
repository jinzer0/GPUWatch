import { ipcMain } from 'electron';

import {
  helperContract,
  type HelperAction,
  type HelperRequestEnvelope,
  type HelperResponseEnvelope
} from './helperContract.js';
import { createHelperRunner, type HelperRunner } from './helperRunner.js';
import { createScheduler, type ElectronScheduler } from './scheduler.js';

export const IPC_CHANNEL_PREFIX = 'gpuwatcher:helper:';

export const IPC_SCAFFOLD_STATUS = {
  ipcHandlers: 'implemented-task-7',
  helperRunner: 'implemented-task-8',
  scheduler: 'implemented-task-8'
} as const;

export const helperIpcChannels = helperContract.map((entry) => ({
  action: entry.helperAction,
  method: entry.electronPreloadMethod,
  channel: `${IPC_CHANNEL_PREFIX}${entry.electronPreloadMethod}`
})) as ReadonlyArray<{ action: HelperAction; method: string; channel: string }>;

const noPayloadActions = new Set<HelperAction>([
  'initialize_app',
  'list_overview',
  'list_servers',
  'seed_demo_data',
  'list_processes',
  'health'
]);

const idPayloadActions = new Set<HelperAction>(['delete_server', 'get_server_detail', 'test_connection', 'refresh_server']);

function invalidPayload(message: string): HelperResponseEnvelope<never> {
  return {
    ok: false,
    error: {
      layer: 'helper_contract',
      type: 'invalid_payload',
      message
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function channelForPreloadMethod(method: string): string {
  return `${IPC_CHANNEL_PREFIX}${method}`;
}

export function validateHelperPayload(action: HelperAction, payload: unknown): HelperResponseEnvelope<object> {
  if (payload === undefined && noPayloadActions.has(action)) {
    return { ok: true, data: {} };
  }

  if (!isRecord(payload)) {
    return invalidPayload(`Payload for ${action} must be an object.`);
  }

  if (noPayloadActions.has(action)) {
    return { ok: true, data: {} };
  }

  if (idPayloadActions.has(action)) {
    return isNonEmptyString(payload.id)
      ? { ok: true, data: { id: payload.id } }
      : invalidPayload(`Payload for ${action} must include a non-empty string id.`);
  }

  if (action === 'save_server') {
    return isRecord(payload.input)
      ? { ok: true, data: { input: payload.input } }
      : invalidPayload('Payload for save_server must include an input object.');
  }

  if (action === 'set_server_enabled') {
    if (!isNonEmptyString(payload.id)) {
      return invalidPayload('Payload for set_server_enabled must include a non-empty string id.');
    }

    if (typeof payload.enabled !== 'boolean') {
      return invalidPayload('Payload for set_server_enabled must include a boolean enabled value.');
    }

    return { ok: true, data: { id: payload.id, enabled: payload.enabled } };
  }

  if (action === 'list_gpu_history') {
    if (!isNonEmptyString(payload.serverId)) {
      return invalidPayload('Payload for list_gpu_history must include a non-empty string serverId.');
    }

    if (payload.range !== '1h' && payload.range !== '6h' && payload.range !== '24h') {
      return invalidPayload('Payload for list_gpu_history must include range 1h, 6h, or 24h.');
    }

    if (payload.gpuIndex !== undefined && payload.gpuIndex !== null && typeof payload.gpuIndex !== 'number') {
      return invalidPayload('Payload for list_gpu_history gpuIndex must be a number or null when provided.');
    }

    if (payload.gpuUuid !== undefined && payload.gpuUuid !== null && typeof payload.gpuUuid !== 'string') {
      return invalidPayload('Payload for list_gpu_history gpuUuid must be a string or null when provided.');
    }

    return {
      ok: true,
      data: {
        serverId: payload.serverId,
        gpuIndex: payload.gpuIndex ?? null,
        gpuUuid: payload.gpuUuid ?? null,
        range: payload.range
      }
    };
  }

  return invalidPayload(`Unsupported helper action ${action}.`);
}

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
