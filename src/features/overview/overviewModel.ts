import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../lib/api';
import type { DiagnosticInput } from '../../lib/diagnostics';
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

export const ALL_OVERVIEW_FILTER_VALUE = 'all';

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

export const pluralizeServers = (count: number) => (count === 1 ? 'server' : 'servers');

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
