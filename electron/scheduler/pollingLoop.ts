import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from '../helperContract.js';
import type { HelperRunner } from '../helperRunner.js';
import { isSuccess } from './contract.js';
import { serverDue } from './dueServers.js';
import type { ServerDetail, ServerRecord } from './types.js';

export type RunHelperAction = <Action extends HelperAction, Payload extends object, Data = unknown>(
  runner: HelperRunner,
  request: HelperRequestEnvelope<Action, Payload>
) => Promise<HelperResponseEnvelope<Data>>;

export interface PollingLoopOptions {
  readonly pollConcurrency: number;
  readonly stalePollingMs: number;
  readonly now: () => Date;
  readonly isRunning: () => boolean;
  readonly run: RunHelperAction;
}

export async function runPollTick(runner: HelperRunner, options: PollingLoopOptions): Promise<void> {
  if (!options.isRunning()) {
    return;
  }

  const serversResponse = await options.run<HelperAction, object, ServerRecord[]>(runner, { action: 'list_servers', payload: {} });
  if (!isSuccess<ServerRecord[]>(serversResponse)) {
    return;
  }

  const dueServers: ServerRecord[] = [];
  for (const server of serversResponse.data) {
    if (!server.enabled) {
      continue;
    }

    const detailResponse = await options.run<HelperAction, object, ServerDetail | null>(runner, {
      action: 'get_server_detail',
      payload: { id: server.id }
    });
    const health = isSuccess<ServerDetail | null>(detailResponse) ? (detailResponse.data?.health ?? null) : null;
    if (serverDue(server, health, options.now(), options.stalePollingMs)) {
      dueServers.push(server);
    }
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(options.pollConcurrency, dueServers.length) }, async () => {
    while (options.isRunning()) {
      const server = dueServers[cursor];
      cursor += 1;
      if (!server) {
        return;
      }

      await options.run(runner, { action: 'refresh_server', payload: { id: server.id } });
    }
  });
  await Promise.all(workers);
}
