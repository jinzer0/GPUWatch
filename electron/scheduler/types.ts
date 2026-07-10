export interface ServerRecord {
  id: string;
  enabled: boolean;
  pollingIntervalSeconds: number;
}

export interface ServerHealth {
  status: string;
  lastPollStartedAt: string | null;
  lastPollFinishedAt: string | null;
  lastSuccessAt: string | null;
}

export interface ServerDetail {
  health: ServerHealth;
}

export interface ElectronSchedulerOptions {
  pollIntervalMs?: number;
  pollConcurrency?: number;
  stalePollingMs?: number;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}
