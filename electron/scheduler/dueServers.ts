import type { ServerHealth, ServerRecord } from './types.js';

function healthReference(health: ServerHealth): string | null {
  return health.lastPollFinishedAt ?? health.lastPollStartedAt ?? health.lastSuccessAt;
}

export function serverDue(server: ServerRecord, health: ServerHealth | null, now: Date, stalePollingMs: number): boolean {
  if (!server.enabled) {
    return false;
  }

  if (!health) {
    return true;
  }

  if (health.status === 'disabled') {
    return false;
  }

  const reference = healthReference(health);
  if (health.status === 'polling') {
    if (!reference) {
      return false;
    }

    const referenceMs = Date.parse(reference);
    return !Number.isNaN(referenceMs) && now.getTime() - referenceMs >= stalePollingMs;
  }

  if (!reference) {
    return true;
  }

  const referenceMs = Date.parse(reference);
  if (Number.isNaN(referenceMs)) {
    return true;
  }

  const intervalSeconds = health.status === 'offline' ? server.pollingIntervalSeconds * 2 : server.pollingIntervalSeconds;
  return now.getTime() - referenceMs >= intervalSeconds * 1000;
}
