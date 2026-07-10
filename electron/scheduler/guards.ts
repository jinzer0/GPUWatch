import type { HelperAction, HelperRequestEnvelope, HelperResponseEnvelope } from '../helperContract.js';
import type { HelperRunner } from '../helperRunner.js';
import { contractEntry, contractError, isNetworkServerAction, isSerializedShortDbMutation, serverOverlapId } from './contract.js';

export interface SchedulerGuardState {
  readonly activeServerActions: Set<string>;
  activeNetworkActions: number;
  dbQueue: Promise<unknown>;
}

async function runWithDbSerialization<Data>(
  state: SchedulerGuardState,
  mutatesDb: boolean,
  operation: () => Promise<HelperResponseEnvelope<Data>>
): Promise<HelperResponseEnvelope<Data>> {
  if (!mutatesDb) {
    return operation();
  }

  const scheduled = state.dbQueue.then(operation, operation);
  state.dbQueue = scheduled.catch(() => undefined);
  return scheduled;
}

export async function runGuardedHelperAction<Action extends HelperAction, Payload extends object, Data = unknown>(
  state: SchedulerGuardState,
  pollConcurrency: number,
  runner: HelperRunner,
  request: HelperRequestEnvelope<Action, Payload>
): Promise<HelperResponseEnvelope<Data>> {
  const entry = contractEntry(request.action);
  const serverId = entry?.pollingOverlapKey === 'server-id' && isNetworkServerAction(request.action) ? serverOverlapId(request) : null;

  if (serverId && state.activeServerActions.has(serverId)) {
    return contractError('poll_already_running', 'poll already running for this server or global network cap reached') as HelperResponseEnvelope<Data>;
  }

  const networkAction = isNetworkServerAction(request.action);
  if (networkAction && state.activeNetworkActions >= pollConcurrency) {
    return contractError('poll_already_running', 'poll already running for this server or global network cap reached') as HelperResponseEnvelope<Data>;
  }

  if (serverId) {
    state.activeServerActions.add(serverId);
  }
  if (networkAction) {
    state.activeNetworkActions += 1;
  }

  try {
    return await runWithDbSerialization(state, isSerializedShortDbMutation(request.action), () => runner.run<Action, Payload, Data>(request));
  } finally {
    if (networkAction) {
      state.activeNetworkActions -= 1;
    }
    if (serverId) {
      state.activeServerActions.delete(serverId);
    }
  }
}
