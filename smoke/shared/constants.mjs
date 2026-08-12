export const expectedBridgeKeys = [
  'deleteWatchRule',
  'deleteServer',
  'getServerDetail',
  'helperHealth',
  'initializeApp',
  'listGpuHistory',
  'listOverview',
  'listProcesses',
  'listServers',
  'listSshConfigHosts',
  'listWatchRules',
  'refreshServer',
  'saveGpuAvailableWatch',
  'saveServer',
  'seedDemoData',
  'setServerEnabled',
  'testConnection'
];

export const forbiddenBridgeKeys = [
  'consumeNotificationEvents',
  'consume_notification_events',
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
