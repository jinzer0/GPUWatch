export type HelperAction =
  | 'initialize_app'
  | 'list_overview'
  | 'list_servers'
  | 'list_ssh_config_hosts'
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
  fallbackBehavior: string;
  notes: string;
}

export const HELPER_REQUEST_ENVELOPE = '{"action":string,"payload":object}' as const;

export const HELPER_RESPONSE_ENVELOPE =
  '{"ok":true,"data":...}|{"ok":false,"error":{"layer":string,"type":string,"message":string}}' as const;

export { helperContract } from './helperContract/actions.js';
import { helperContract } from './helperContract/actions.js';

export const frontendApiContract = helperContract.filter((entry) => entry.frontendApi !== null);

export const rendererHelperContract = helperContract.filter(
  (entry): entry is (typeof helperContract)[number] & { visibility: 'renderer'; electronPreloadMethod: string } =>
    entry.visibility === 'renderer'
);

export const mainOnlyHelperContract = helperContract.filter(
  (entry): entry is (typeof helperContract)[number] & { visibility: 'main-only'; electronPreloadMethod: null } =>
    entry.visibility === 'main-only'
);
