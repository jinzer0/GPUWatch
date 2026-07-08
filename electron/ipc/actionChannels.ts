import { rendererHelperContract, type HelperAction } from '../helperContract.js';

export const IPC_CHANNEL_PREFIX = 'gpuwatcher:helper:';

export const helperIpcChannels = rendererHelperContract.map((entry) => ({
  action: entry.helperAction,
  method: entry.electronPreloadMethod,
  channel: `${IPC_CHANNEL_PREFIX}${entry.electronPreloadMethod}`
})) as ReadonlyArray<{ action: HelperAction; method: string; channel: string }>;

export function channelForPreloadMethod(method: string): string {
  return `${IPC_CHANNEL_PREFIX}${method}`;
}
