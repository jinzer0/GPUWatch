export const expectedBridgeKeys = [
  'deleteServer',
  'getServerDetail',
  'helperHealth',
  'initializeApp',
  'listGpuHistory',
  'listOverview',
  'listProcesses',
  'listServers',
  'listSshConfigHosts',
  'refreshServer',
  'saveServer',
  'seedDemoData',
  'setServerEnabled',
  'testConnection'
];

export const forbiddenBridgeKeys = [
  'dispatch',
  'helperPath',
  'helperRunner',
  'invoke',
  'migrationStatus',
  'pollDueServers',
  'poll_due_servers',
  'runAction',
  'deferredMigration',
  'migrationRequired'
];

export const forbiddenElectronMetadataKeys = ['deferredMigration', 'migrationRequired', 'migrationStatus', 'migrations'];
export const expectedElectronMetadataKeys = ['isElectron', 'platform', 'versions'];
