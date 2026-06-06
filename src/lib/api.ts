import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionTestResultDto,
  GpuHistoryRange,
  GpuHistoryResponseDto,
  ProcessRowDto,
  Server,
  ServerDetailDto,
  ServerInput,
  ServerOverviewDto
} from './types';

type HelperErrorEnvelope = {
  layer?: string;
  type?: string;
  message?: string;
};

type HelperResponseEnvelope<Result> = { ok: true; data: Result } | { ok: false; error: HelperErrorEnvelope };

interface CommandMap {
  initialize_app: { args: undefined; result: ServerOverviewDto[]; electronMethod: 'initializeApp'; fallback: 'empty-array' };
  list_overview: { args: undefined; result: ServerOverviewDto[]; electronMethod: 'listOverview'; fallback: 'empty-array' };
  list_servers: { args: undefined; result: Server[]; electronMethod: 'listServers'; fallback: 'empty-array' };
  save_server: { args: { input: ServerInput }; result: Server; electronMethod: 'saveServer'; fallback: 'backend-required' };
  delete_server: { args: { id: string }; result: void; electronMethod: 'deleteServer'; fallback: 'backend-required' };
  set_server_enabled: {
    args: { id: string; enabled: boolean };
    result: Server;
    electronMethod: 'setServerEnabled';
    fallback: 'backend-required';
  };
  seed_demo_data: { args: undefined; result: ServerOverviewDto[]; electronMethod: 'seedDemoData'; fallback: 'backend-required' };
  get_server_detail: {
    args: { id: string };
    result: ServerDetailDto | null;
    electronMethod: 'getServerDetail';
    fallback: 'null';
  };
  list_gpu_history: {
    args: { serverId: string; gpuIndex?: number | null; gpuUuid?: string | null; range: GpuHistoryRange };
    result: GpuHistoryResponseDto;
    electronMethod: 'listGpuHistory';
    fallback: 'empty-history';
  };
  list_processes: { args: undefined; result: ProcessRowDto[]; electronMethod: 'listProcesses'; fallback: 'empty-array' };
  test_connection: {
    args: { id: string };
    result: ConnectionTestResultDto;
    electronMethod: 'testConnection';
    fallback: 'connection-unavailable';
  };
  refresh_server: {
    args: { id: string };
    result: ConnectionTestResultDto;
    electronMethod: 'refreshServer';
    fallback: 'connection-unavailable';
  };
}

const commandMeta: {
  [Name in keyof CommandMap]: Pick<CommandMap[Name], 'electronMethod' | 'fallback'>;
} = {
  initialize_app: { electronMethod: 'initializeApp', fallback: 'empty-array' },
  list_overview: { electronMethod: 'listOverview', fallback: 'empty-array' },
  list_servers: { electronMethod: 'listServers', fallback: 'empty-array' },
  save_server: { electronMethod: 'saveServer', fallback: 'backend-required' },
  delete_server: { electronMethod: 'deleteServer', fallback: 'backend-required' },
  set_server_enabled: { electronMethod: 'setServerEnabled', fallback: 'backend-required' },
  seed_demo_data: { electronMethod: 'seedDemoData', fallback: 'backend-required' },
  get_server_detail: { electronMethod: 'getServerDetail', fallback: 'null' },
  list_gpu_history: { electronMethod: 'listGpuHistory', fallback: 'empty-history' },
  list_processes: { electronMethod: 'listProcesses', fallback: 'empty-array' },
  test_connection: { electronMethod: 'testConnection', fallback: 'connection-unavailable' },
  refresh_server: { electronMethod: 'refreshServer', fallback: 'connection-unavailable' }
};

const backendUnavailableMessage =
  'GPUWatcher backend is unavailable. Launch the app in Electron or Tauri to use this action.';

function getElectronBridge(): Window['gpuwatcher'] | undefined {
  return typeof window === 'undefined' ? undefined : window.gpuwatcher;
}

function isTauriRuntimeAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const candidates = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: unknown;
  };

  return Boolean(candidates.__TAURI_INTERNALS__ ?? candidates.__TAURI__ ?? candidates.isTauri);
}

function helperErrorToError(error: HelperErrorEnvelope): Error {
  const message = error.message?.trim() || backendUnavailableMessage;
  const typedError = new Error(message) as Error & { layer?: string; type?: string };
  typedError.layer = error.layer;
  typedError.type = error.type;
  return typedError;
}

function emptyHistory(args?: CommandMap['list_gpu_history']['args']): GpuHistoryResponseDto {
  const timestamp = new Date(0).toISOString();
  return {
    serverId: args?.serverId ?? '',
    serverName: 'Backend unavailable',
    pollingIntervalSeconds: 0,
    range: args?.range ?? '1h',
    startedAt: timestamp,
    finishedAt: timestamp,
    series: []
  };
}

function unavailableConnectionResult(): ConnectionTestResultDto {
  return {
    ok: false,
    status: 'error',
    errorType: 'backend_unavailable',
    message: backendUnavailableMessage,
  };
}

function noRuntimeFallback<Name extends keyof CommandMap>(
  fallback: CommandMap[Name]['fallback'],
  args: CommandMap[Name]['args'] | undefined
): CommandMap[Name]['result'] {
  if (fallback === 'empty-array') {
    return [] as CommandMap[Name]['result'];
  }

  if (fallback === 'null') {
    return null as CommandMap[Name]['result'];
  }

  if (fallback === 'empty-history') {
    return emptyHistory(args as CommandMap['list_gpu_history']['args'] | undefined) as CommandMap[Name]['result'];
  }

  if (fallback === 'connection-unavailable') {
    return unavailableConnectionResult() as CommandMap[Name]['result'];
  }

  throw new Error(backendUnavailableMessage);
}

async function callCommand<Name extends keyof CommandMap>(
  command: Name,
  ...args: CommandMap[Name]['args'] extends undefined ? [] : [CommandMap[Name]['args']]
): Promise<CommandMap[Name]['result']> {
  const commandArgs = args[0];
  const meta = commandMeta[command];
  const electronMethod = getElectronBridge()?.[meta.electronMethod] as
    | ((payload: object) => Promise<HelperResponseEnvelope<CommandMap[Name]['result']>>)
    | undefined;

  if (electronMethod) {
    const response = (await electronMethod(commandArgs ?? {})) as HelperResponseEnvelope<CommandMap[Name]['result']>;
    if (response.ok) {
      return response.data;
    }

    throw helperErrorToError(response.error);
  }

  try {
    return commandArgs === undefined
      ? await invoke<CommandMap[Name]['result']>(command)
      : await invoke<CommandMap[Name]['result']>(command, commandArgs);
  } catch (error) {
    if (isTauriRuntimeAvailable()) {
      throw error;
    }
  }

  return noRuntimeFallback<Name>(meta.fallback, commandArgs);
}

export function initializeApp(): Promise<ServerOverviewDto[]> {
  return callCommand('initialize_app');
}

export function listOverview(): Promise<ServerOverviewDto[]> {
  return callCommand('list_overview');
}

export function listServers(): Promise<Server[]> {
  return callCommand('list_servers');
}

export function saveServer(input: ServerInput): Promise<Server> {
  return callCommand('save_server', { input });
}

export function deleteServer(id: string): Promise<void> {
  return callCommand('delete_server', { id });
}

export function setServerEnabled(id: string, enabled: boolean): Promise<Server> {
  return callCommand('set_server_enabled', { id, enabled });
}

export function seedDemoData(): Promise<ServerOverviewDto[]> {
  return callCommand('seed_demo_data');
}

export function getServerDetail(id: string): Promise<ServerDetailDto | null> {
  return callCommand('get_server_detail', { id });
}

export function listGpuHistory(
  serverId: string | null | undefined,
  gpuIndex: number | null | undefined,
  gpuUuid: string | null | undefined,
  range: GpuHistoryRange
): Promise<GpuHistoryResponseDto> {
  const requiredServerId = serverId?.trim();
  if (!requiredServerId) {
    return Promise.reject(new Error('serverId is required to list GPU history.'));
  }

  return callCommand('list_gpu_history', {
    serverId: requiredServerId,
    gpuIndex: gpuIndex ?? null,
    gpuUuid: gpuUuid ?? null,
    range
  });
}

export function listProcesses(): Promise<ProcessRowDto[]> {
  return callCommand('list_processes');
}

export function testConnection(id: string): Promise<ConnectionTestResultDto> {
  return callCommand('test_connection', { id });
}

export function refreshServer(id: string): Promise<ConnectionTestResultDto> {
  return callCommand('refresh_server', { id });
}

export const queryKeys = {
  initialize: ['initialize'] as const,
  overview: ['overview'] as const,
  servers: ['servers'] as const,
  detail: (id: string) => ['server-detail', id] as const,
  gpuHistory: (
    serverId: string | null | undefined,
    gpuIndex: number | null | undefined,
    gpuUuid: string | null | undefined,
    range: GpuHistoryRange
  ) => ['gpu-history', serverId ?? null, gpuIndex ?? null, gpuUuid ?? null, range] as const,
  processes: ['processes'] as const
};
