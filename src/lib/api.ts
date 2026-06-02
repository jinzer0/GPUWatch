import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionTestResultDto,
  ProcessRowDto,
  Server,
  ServerDetailDto,
  ServerInput,
  ServerOverviewDto
} from './types';

interface CommandMap {
  initialize_app: { args: undefined; result: ServerOverviewDto[] };
  list_overview: { args: undefined; result: ServerOverviewDto[] };
  list_servers: { args: undefined; result: Server[] };
  save_server: { args: { input: ServerInput }; result: Server };
  delete_server: { args: { id: string }; result: void };
  set_server_enabled: { args: { id: string; enabled: boolean }; result: Server };
  seed_demo_data: { args: undefined; result: ServerOverviewDto[] };
  get_server_detail: { args: { id: string }; result: ServerDetailDto | null };
  list_processes: { args: undefined; result: ProcessRowDto[] };
  test_connection: { args: { id: string }; result: ConnectionTestResultDto };
  refresh_server: { args: { id: string }; result: ConnectionTestResultDto };
}

function callCommand<Name extends keyof CommandMap>(
  command: Name,
  ...args: CommandMap[Name]['args'] extends undefined ? [] : [CommandMap[Name]['args']]
): Promise<CommandMap[Name]['result']> {
  const commandArgs = args[0];
  return commandArgs === undefined
    ? invoke<CommandMap[Name]['result']>(command)
    : invoke<CommandMap[Name]['result']>(command, commandArgs);
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
  processes: ['processes'] as const
};
