import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { LabeledSelectOption } from '../../components/ui';
import { refreshServer, seedDemoData } from '../../lib/api';
import { formatUnknown } from '../../lib/format';
import { useUiStore } from '../../lib/store';
import type { ServerOverviewDto } from '../../lib/types';
import { DEFAULT_OVERVIEW_FILTERS, filterOverviewRows, type OverviewFilters } from '../../lib/visibility';
import { ALL_OVERVIEW_FILTER_VALUE, errorMessage, invalidateLiveData, invalidateRemoteRefreshData, pluralizeServers, type ActionFeedback, type RefreshFeedback } from './overviewModel';

export const useOverviewController = (overview: ServerOverviewDto[]) => {
  const queryClient = useQueryClient();
  const selectServer = useUiStore((state) => state.selectServer);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const [searchText, setSearchText] = useState(DEFAULT_OVERVIEW_FILTERS.searchText);
  const [statusFilter, setStatusFilter] = useState(DEFAULT_OVERVIEW_FILTERS.status ?? ALL_OVERVIEW_FILTER_VALUE);
  const [quickFilter, setQuickFilter] = useState<OverviewFilters['state']>(DEFAULT_OVERVIEW_FILTERS.state);
  const [seedFeedback, setSeedFeedback] = useState<ActionFeedback | null>(null);
  const [refreshFeedback, setRefreshFeedback] = useState<RefreshFeedback | null>(null);
  const serverName = (id: string) => overview.find((server) => server.id === id)?.name ?? id;
  const seedMutation = useMutation({
    mutationFn: () => seedDemoData(),
    onError: (mutationError) => {
      setSeedFeedback({ label: 'Seed demo data', message: `Demo data seed failed. ${errorMessage(mutationError)}`, state: 'error' });
    },
    onMutate: () => {
      setSeedFeedback({ label: 'Seed demo data', state: 'pending' });
    },
    onSuccess: (seededOverview) => {
      setSeedFeedback({
        label: 'Seed demo data',
        message: `Demo data seeded. ${seededOverview.length.toLocaleString()} ${pluralizeServers(seededOverview.length)} available.`,
        state: 'success'
      });
      return invalidateLiveData(queryClient);
    }
  });
  const refreshMutation = useMutation({
    mutationFn: (id: string) => refreshServer(id),
    onError: (mutationError, id) => {
      const name = serverName(id);
      setRefreshFeedback({ label: `Refresh ${name}`, message: `Remote refresh failed for ${name}. ${errorMessage(mutationError)}`, serverId: id, state: 'error' });
    },
    onMutate: (id) => {
      setRefreshFeedback({ label: `Refresh ${serverName(id)}`, serverId: id, state: 'pending' });
    },
    onSuccess: (result, id) => {
      const name = serverName(id);
      if (!result.ok) {
        setRefreshFeedback({
          diagnostic: { errorType: result.errorType, message: result.message },
          label: `Refresh ${name}`,
          message: `Remote refresh failed for ${name}. ${formatUnknown(result.message)}`,
          serverId: id,
          state: 'error'
        });
        return undefined;
      }

      setRefreshFeedback({ label: `Refresh ${name}`, message: `Remote refresh succeeded for ${name}. ${formatUnknown(result.message)}`, serverId: id, state: 'success' });
      return invalidateRemoteRefreshData(queryClient, id);
    }
  });
  const statusOptions = useMemo<LabeledSelectOption[]>(() => {
    const uniqueStatuses = Array.from(new Set(overview.map((server) => server.status))).sort((left, right) => left.localeCompare(right));
    return [{ label: 'All statuses', value: ALL_OVERVIEW_FILTER_VALUE }, ...uniqueStatuses.map((status) => ({ label: formatUnknown(status), value: status }))];
  }, [overview]);
  const filters = useMemo<OverviewFilters>(() => ({ searchText, status: statusFilter === ALL_OVERVIEW_FILTER_VALUE ? null : statusFilter, state: quickFilter }), [quickFilter, searchText, statusFilter]);
  const visibleRows = useMemo(() => filterOverviewRows(overview, filters), [filters, overview]);

  const resetFilters = () => {
    setSearchText(DEFAULT_OVERVIEW_FILTERS.searchText);
    setStatusFilter(DEFAULT_OVERVIEW_FILTERS.status ?? ALL_OVERVIEW_FILTER_VALUE);
    setQuickFilter(DEFAULT_OVERVIEW_FILTERS.state);
  };
  const openServer = (id: string) => {
    selectServer(id);
    setActiveTab('detail');
  };

  return {
    openServer,
    quickFilter,
    refreshFeedback,
    refreshMutation,
    resetFilters,
    searchText,
    seedFeedback,
    seedMutation,
    setQuickFilter,
    setSearchText,
    setStatusFilter,
    statusFilter,
    statusOptions,
    visibleRows
  };
};
