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
  | 'poll_due_servers'
  | 'health';

export type ActionVisibility = 'renderer' | 'main-only';

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
  helperAction: HelperAction;
  visibility: ActionVisibility;
  electronPreloadMethod: string | null;
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
    helperAction: 'initialize_app',
    visibility: 'renderer',
    electronPreloadMethod: 'initializeApp',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return the same overview list as list_overview; preload exposes an action-specific initializeApp method.',
    notes: 'Initial app load delegates to the same overview data surface as list_overview.'
  },
  {
    frontendApi: 'listOverview',
    helperAction: 'list_overview',
    visibility: 'renderer',
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
    helperAction: 'list_servers',
    visibility: 'renderer',
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
    helperAction: 'save_server',
    visibility: 'renderer',
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
    helperAction: 'delete_server',
    visibility: 'renderer',
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
    helperAction: 'set_server_enabled',
    visibility: 'renderer',
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
    helperAction: 'seed_demo_data',
    visibility: 'renderer',
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
    helperAction: 'get_server_detail',
    visibility: 'renderer',
    electronPreloadMethod: 'getServerDetail',
    timeoutClass: 'local-10s',
    dbMutation: 'none',
    pollingOverlapKey: 'none',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'migrate',
    fallbackBehavior: 'Return null data when the server id is not found, matching the existing desktop behavior.',
    notes: 'Reads one server, health, and latest snapshot to build ServerDetailDto.'
  },
  {
    frontendApi: 'listGpuHistory',
    helperAction: 'list_gpu_history',
    visibility: 'renderer',
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
    helperAction: 'list_processes',
    visibility: 'renderer',
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
    helperAction: 'test_connection',
    visibility: 'renderer',
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
    helperAction: 'refresh_server',
    visibility: 'renderer',
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
    helperAction: 'poll_due_servers',
    visibility: 'main-only',
    electronPreloadMethod: null,
    timeoutClass: 'ssh-60s',
    dbMutation: 'poll-health-start-and-result-write',
    pollingOverlapKey: 'electron-main-scheduler',
    helperEnvelope: 'request:{action:string,payload:object};response:{ok:true,data}|{ok:false,error:{layer,type,message}}',
    migrationStatus: 'electron-main-only',
    fallbackBehavior: 'Return a structured main_scheduler_owned error if called directly; renderer bridge and IPC do not expose it.',
    notes: 'Electron main performs due polling with list_servers, get_server_detail, and refresh_server without adding a renderer-callable polling method.'
  },
  {
    frontendApi: null,
    helperAction: 'health',
    visibility: 'renderer',
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

export const frontendApiContract = helperContract.filter((entry) => entry.frontendApi !== null);

export const rendererHelperContract = helperContract.filter(
  (entry): entry is (typeof helperContract)[number] & { visibility: 'renderer'; electronPreloadMethod: string } =>
    entry.visibility === 'renderer'
);

export const mainOnlyHelperContract = helperContract.filter(
  (entry): entry is (typeof helperContract)[number] & { visibility: 'main-only'; electronPreloadMethod: null } =>
    entry.visibility === 'main-only'
);
