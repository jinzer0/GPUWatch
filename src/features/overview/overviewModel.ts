import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../lib/api';
import type { DiagnosticInput } from '../../lib/diagnostics';
import type { ServerOverviewDto } from '../../lib/types';
import type { OverviewFilters } from '../../lib/visibility';

export type ActionFeedback =
  | {
      readonly label: string;
      readonly state: 'pending';
    }
  | {
      readonly diagnostic?: DiagnosticInput;
      readonly label: string;
      readonly message: string;
      readonly state: 'error' | 'success';
    };

export type RefreshFeedback = ActionFeedback & {
  readonly serverId: string;
};

export interface FleetSummary {
  readonly totalServers: number;
  readonly onlineServers: number;
  readonly attentionServers: number;
  readonly totalGpus: number;
  readonly busyGpus: number;
  readonly freeGpus: number;
}

export const ALL_OVERVIEW_FILTER_VALUE = 'all';

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

export const pluralizeServers = (count: number) => (count === 1 ? 'server' : 'servers');

export const isOverviewStatusOnline = (status: string) => status.toLowerCase() === 'online';

export const overviewNeedsAttention = (server: ServerOverviewDto) => {
  const status = server.status.toLowerCase();

  return (
    status.includes('stale') ||
    status.includes('error') ||
    status.includes('failed') ||
    status.includes('degraded') ||
    server.lastErrorType !== null ||
    server.lastErrorMessage !== null
  );
};

export const summarizeOverviewFleet = (rows: readonly ServerOverviewDto[]): FleetSummary =>
  rows.reduce<FleetSummary>(
    (summary, row) => ({
      totalServers: summary.totalServers + 1,
      onlineServers: summary.onlineServers + (isOverviewStatusOnline(row.status) ? 1 : 0),
      attentionServers: summary.attentionServers + (overviewNeedsAttention(row) ? 1 : 0),
      totalGpus: summary.totalGpus + row.gpuTotal,
      busyGpus: summary.busyGpus + row.busyGpuCount,
      freeGpus: summary.freeGpus + row.freeGpuCount
    }),
    {
      totalServers: 0,
      onlineServers: 0,
      attentionServers: 0,
      totalGpus: 0,
      busyGpus: 0,
      freeGpus: 0
    }
  );

export const invalidateLiveData = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
    queryClient.invalidateQueries({ queryKey: queryKeys.processes })
  ]);

export const invalidateRemoteRefreshData = (queryClient: QueryClient, id: string) =>
  Promise.all([
    invalidateLiveData(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) }),
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'gpu-history' && query.queryKey[1] === id })
  ]);

export const parseOverviewQuickFilter = (value: string): OverviewFilters['state'] => {
  if (value === 'stale' || value === 'error') {
    return value;
  }
  return 'all';
};
