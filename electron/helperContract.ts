export type HelperAction =
  | 'initialize_app'
  | 'list_overview'
  | 'list_servers'
  | 'save_server'
  | 'delete_server'
  | 'set_server_enabled'
  | 'seed_demo_data'
  | 'get_server_detail'
  | 'list_gpu_history'
  | 'list_processes'
  | 'test_connection'
  | 'refresh_server'
  | 'health';

export type TimeoutClass = 'local-10s' | 'ssh-60s';

export type DbMutation =
  | 'none'
  | 'servers-write'
  | 'servers-delete'
  | 'server-enabled-write'
  | 'demo-seed-write'
  | 'poll-health-start-and-result-write';

export type PollingOverlapKey = 'none' | 'server-id' | 'electron-main-scheduler';

export type MigrationStatus = 'migrate' | 'electron-main-only' | 'documented-helper-health';

export interface HelperRequestEnvelope<Action extends HelperAction = HelperAction, Payload extends object = object> {
  action: Action;
  payload: Payload;
}

export type HelperErrorLayer = 'storage_app' | 'protocol' | 'transport_ssh' | 'helper_contract' | string;

export interface HelperErrorEnvelope {
  layer: HelperErrorLayer;
  type: string;
  message: string;
}

export type HelperResponseEnvelope<Data = unknown> =
  | { ok: true; data: Data }
  | { ok: false; error: HelperErrorEnvelope };

export interface HelperContractEntry {
  frontendApi: string | null;
  tauriCommand: string | null;
  helperAction: HelperAction;
  electronPreloadMethod: string;
  timeoutClass: TimeoutClass;
  dbMutation: DbMutation;
  pollingOverlapKey: PollingOverlapKey;
  helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}';
  migrationStatus: MigrationStatus;
  fallbackBehavior: string;
  notes: string;
}

export const HELPER_REQUEST_ENVELOPE = '{"action":string,"payload":object}' as const;

export const HELPER_RESPONSE_ENVELOPE =
  '{"ok":true,"data":...}|{"ok":false,"error":{"layer":string,"type":string,"message":string}}' as const;

export const helperContract = [
  {
    frontendApi: 'initializeApp',
    tauriCommand: 'initialize_app',
    helperAction: 'initialize_app',
    electronPreloadMethod: 'initializeApp',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return the same overview list as list_overview; preload exposes an action-specific initializeApp method.',
    notes: 'Tauri currently delegates initialize_app directly to list_overview.'
  },
  {
    frontendApi: 'listOverview',
    tauriCommand: 'list_overview',
    helperAction: 'list_overview',
    electronPreloadMethod: 'listOverview',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return an empty array only if the database has no servers; surface helper errors through the response envelope.',
    notes: 'Reads servers, all health rows, and latest snapshots to build ServerOverviewDto[].'
  },
  {
    frontendApi: 'listServers',
    tauriCommand: 'list_servers',
    helperAction: 'list_servers',
    electronPreloadMethod: 'listServers',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return an empty array only if the database has no servers; do not synthesize settings.',
    notes: 'SQLite read of servers ordered by createdAt.'
  },
  {
    frontendApi: 'saveServer',
    tauriCommand: 'save_server',
    helperAction: 'save_server',
    electronPreloadMethod: 'saveServer',
    timeoutClass: 'local-10s',
    dbMutation: 'servers-write',
    pollingOverlapKey: 'server-id',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Serialize with other DB-mutating helper calls; if the saved server is currently polling, Electron main must prevent overlap or discard stale poll results by config revision.',
    notes: 'Creates or updates a server, increments configRevision on update, and ensures server_health status is idle or disabled.'
  },
  {
    frontendApi: 'deleteServer',
    tauriCommand: 'delete_server',
    helperAction: 'delete_server',
    electronPreloadMethod: 'deleteServer',
    timeoutClass: 'local-10s',
    dbMutation: 'servers-delete',
    pollingOverlapKey: 'server-id',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Serialize with other DB-mutating helper calls and block same-server polling while deleting; return void data on success.',
    notes: 'Deletes server row; health, latest snapshot, and history rows are removed by foreign-key cascade where applicable.'
  },
  {
    frontendApi: 'setServerEnabled',
    tauriCommand: 'set_server_enabled',
    helperAction: 'set_server_enabled',
    electronPreloadMethod: 'setServerEnabled',
    timeoutClass: 'local-10s',
    dbMutation: 'server-enabled-write',
    pollingOverlapKey: 'server-id',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Serialize with other DB-mutating helper calls and block same-server polling while toggling enabled state.',
    notes: 'Updates enabled, increments configRevision, and sets health to idle or disabled.'
  },
  {
    frontendApi: 'seedDemoData',
    tauriCommand: 'seed_demo_data',
    helperAction: 'seed_demo_data',
    electronPreloadMethod: 'seedDemoData',
    timeoutClass: 'local-10s',
    dbMutation: 'demo-seed-write',
    pollingOverlapKey: 'server-id',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Serialize with other DB-mutating helper calls; if it reuses an existing server, treat that server id as the same-server overlap key.',
    notes: 'Creates a demo server if needed, stores the protocol success fixture as latest snapshot/history, then returns overview.'
  },
  {
    frontendApi: 'getServerDetail',
    tauriCommand: 'get_server_detail',
    helperAction: 'get_server_detail',
    electronPreloadMethod: 'getServerDetail',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return null data when the server id is not found, matching Tauri behavior.',
    notes: 'Reads one server, health, and latest snapshot to build ServerDetailDto.'
  },
  {
    frontendApi: 'listGpuHistory',
    tauriCommand: 'list_gpu_history',
    helperAction: 'list_gpu_history',
    electronPreloadMethod: 'listGpuHistory',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Renderer-side API keeps rejecting blank serverId before IPC; helper validates the received payload and returns contract errors for invalid ranges.',
    notes: 'Reads retained GPU history samples for serverId, optional gpuIndex/gpuUuid, and range 1h/6h/24h.'
  },
  {
    frontendApi: 'listProcesses',
    tauriCommand: 'list_processes',
    helperAction: 'list_processes',
    electronPreloadMethod: 'listProcesses',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return an empty array when no latest snapshots contain processes; preserve stale flags from read model.',
    notes: 'Reads servers, all health rows, and latest snapshots to build ProcessRowDto[].'
  },
  {
    frontendApi: 'testConnection',
    tauriCommand: 'test_connection',
    helperAction: 'test_connection',
    electronPreloadMethod: 'testConnection',
    timeoutClass: 'ssh-60s',
    dbMutation: 'none',
    pollingOverlapKey: 'server-id',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Do not store the collected snapshot; return ConnectionTestResultDto with offline for transport_ssh errors and error for other layers.',
    notes: 'Reads server config, runs no-install SSH collection, and reports success/failure without mutating health or snapshots.'
  },
  {
    frontendApi: 'refreshServer',
    tauriCommand: 'refresh_server',
    helperAction: 'refresh_server',
    electronPreloadMethod: 'refreshServer',
    timeoutClass: 'ssh-60s',
    dbMutation: 'poll-health-start-and-result-write',
    pollingOverlapKey: 'server-id',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Electron main must reject same-server overlap with poll_already_running, preserve stale success on failure, and discard results when configRevision changed.',
    notes: 'Checks enabled state, marks health polling, runs no-install SSH collection, stores latest success/history or failure health metadata.'
  },
  {
    frontendApi: null,
    tauriCommand: null,
    helperAction: 'health',
    electronPreloadMethod: 'helperHealth',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'documented-helper-health',
    fallbackBehavior: 'Optional helper smoke action only; renderer frontend API must not depend on it.',
    notes: 'Allowed by the migration task as a documented helper-only action for packaging/smoke checks.'
  }
] as const satisfies readonly HelperContractEntry[];

export const tauriCommandContract = helperContract.filter((entry) => entry.tauriCommand !== null);

export const frontendApiContract = helperContract.filter((entry) => entry.frontendApi !== null);
