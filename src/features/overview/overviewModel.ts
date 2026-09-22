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

export interface OverviewGpuActivitySummary {
  readonly attentionHosts: readonly OverviewAttentionHost[];
  readonly totalGpus: number | null;
  readonly busyGpus: number | null;
  readonly freeGpus: number | null;
  readonly knownGpuHosts: number;
  readonly unknownGpuHosts: number;
  readonly activeProcessCount: null;
  readonly activeProcessSemantics: 'unavailable-from-overview-dto';
}

export interface FleetSummary extends OverviewGpuActivitySummary {
  readonly totalServers: number;
  readonly onlineServers: number;
  readonly attentionServers: number;
}

export interface OverviewAttentionHost {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly status: string;
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

const isKnownGpuCount = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

export const overviewGpuActivityKnown = (server: ServerOverviewDto) => {
  if (!isKnownGpuCount(server.gpuTotal) || !isKnownGpuCount(server.busyGpuCount) || !isKnownGpuCount(server.freeGpuCount)) {
    return false;
  }

  return server.lastSuccessAt !== null || server.gpuTotal > 0 || server.busyGpuCount > 0 || server.freeGpuCount > 0;
};

export const summarizeOverviewFleet = (rows: readonly ServerOverviewDto[]): FleetSummary => {
  const summary = rows.reduce<
    Omit<FleetSummary, 'totalGpus' | 'busyGpus' | 'freeGpus' | 'activeProcessCount' | 'activeProcessSemantics'> & {
      totalGpus: number;
      busyGpus: number;
      freeGpus: number;
    }
  >(
    (current, row) => {
      const needsAttention = overviewNeedsAttention(row);
      const gpuActivityKnown = overviewGpuActivityKnown(row);

      return {
        totalServers: current.totalServers + 1,
        onlineServers: current.onlineServers + (isOverviewStatusOnline(row.status) ? 1 : 0),
        attentionServers: current.attentionServers + (needsAttention ? 1 : 0),
        attentionHosts: needsAttention
          ? [
              ...current.attentionHosts,
              {
                id: row.id,
                name: row.name,
                host: row.host,
                status: row.status
              }
            ]
          : current.attentionHosts,
        totalGpus: gpuActivityKnown ? current.totalGpus + row.gpuTotal : current.totalGpus,
        busyGpus: gpuActivityKnown ? current.busyGpus + row.busyGpuCount : current.busyGpus,
        freeGpus: gpuActivityKnown ? current.freeGpus + row.freeGpuCount : current.freeGpus,
        knownGpuHosts: current.knownGpuHosts + (gpuActivityKnown ? 1 : 0),
        unknownGpuHosts: current.unknownGpuHosts + (gpuActivityKnown ? 0 : 1)
      };
    },
    {
      totalServers: 0,
      onlineServers: 0,
      attentionServers: 0,
      attentionHosts: [],
      totalGpus: 0,
      busyGpus: 0,
      freeGpus: 0,
      knownGpuHosts: 0,
      unknownGpuHosts: 0
    }
  );

  return {
    ...summary,
    totalGpus: summary.unknownGpuHosts === 0 ? summary.totalGpus : null,
    busyGpus: summary.unknownGpuHosts === 0 ? summary.busyGpus : null,
    freeGpus: summary.unknownGpuHosts === 0 ? summary.freeGpus : null,
    activeProcessCount: null,
    activeProcessSemantics: 'unavailable-from-overview-dto'
  };
};

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
