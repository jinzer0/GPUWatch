import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  InlineToolbar,
  LabeledSelect,
  LabeledTextInput,
  LoadingState,
  MetricCard,
  ResetButton,
  StatusBadge,
  type LabeledSelectOption
} from '../../components/ui';
import { formatPercent, formatTemperature, formatTime, formatUnknown, sanitizeMessage } from '../../lib/format';
import { queryKeys, refreshServer, seedDemoData } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { ServerOverviewDto } from '../../lib/types';
import { DEFAULT_OVERVIEW_FILTERS, filterOverviewRows, type OverviewFilters } from '../../lib/visibility';

const ALL_FILTER_VALUE = 'all';

const invalidateLiveData = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
    queryClient.invalidateQueries({ queryKey: queryKeys.processes })
  ]);

export const OverviewScreen = ({ overview, isLoading, error }: { overview: ServerOverviewDto[]; isLoading: boolean; error: Error | null }) => {
  const queryClient = useQueryClient();
  const selectServer = useUiStore((state) => state.selectServer);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const [searchText, setSearchText] = useState(DEFAULT_OVERVIEW_FILTERS.searchText);
  const [statusFilter, setStatusFilter] = useState(DEFAULT_OVERVIEW_FILTERS.status ?? ALL_FILTER_VALUE);
  const [quickFilter, setQuickFilter] = useState<OverviewFilters['state']>(DEFAULT_OVERVIEW_FILTERS.state);
  const seedMutation = useMutation({
    mutationFn: seedDemoData,
    onSuccess: () => invalidateLiveData(queryClient)
  });
  const refreshMutation = useMutation({
    mutationFn: refreshServer,
    onSuccess: (_result, id) =>
      Promise.all([invalidateLiveData(queryClient), queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) })])
  });

  const statusOptions = useMemo<LabeledSelectOption[]>(() => {
    const uniqueStatuses = Array.from(new Set(overview.map((server) => server.status))).sort((left, right) => left.localeCompare(right));
    return [{ label: 'All statuses', value: ALL_FILTER_VALUE }, ...uniqueStatuses.map((status) => ({ label: formatUnknown(status), value: status }))];
  }, [overview]);

  const filters = useMemo<OverviewFilters>(
    () => ({
      searchText,
      status: statusFilter === ALL_FILTER_VALUE ? null : statusFilter,
      state: quickFilter
    }),
    [quickFilter, searchText, statusFilter]
  );

  const visibleRows = useMemo(() => filterOverviewRows(overview, filters), [filters, overview]);

  const resetFilters = () => {
    setSearchText(DEFAULT_OVERVIEW_FILTERS.searchText);
    setStatusFilter(DEFAULT_OVERVIEW_FILTERS.status ?? ALL_FILTER_VALUE);
    setQuickFilter(DEFAULT_OVERVIEW_FILTERS.state);
  };

  const openServer = (id: string) => {
    selectServer(id);
    setActiveTab('detail');
  };

  const showNoData = !isLoading && !error && overview.length === 0;
  const showFilteredEmpty = !isLoading && !error && overview.length > 0 && visibleRows.length === 0;

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Overview</div>
            <h2 className="mt-2 font-[var(--font-display)] text-4xl font-black tracking-[-0.08em]">Fleet snapshot</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
              A terse readout of configured GPU hosts, latest successful polls, and current health metadata.
            </p>
          </div>
          <button className="btn btn-primary" disabled={seedMutation.isPending} onClick={() => seedMutation.mutate()} type="button">
            Seed demo data
          </button>
        </div>
      </div>

      <InlineToolbar label="Overview filters" summary={`Showing ${visibleRows.length} of ${overview.length} servers`}>
        <LabeledTextInput
          id="overview-search"
          label="Search servers"
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Name, host, status, or error"
          value={searchText}
        />
        <LabeledSelect
          id="overview-status"
          label="Status"
          onChange={(event) => setStatusFilter(event.target.value)}
          options={statusOptions}
          value={statusFilter}
        />
        <LabeledSelect
          id="overview-quick-filter"
          label="Quick filter"
          onChange={(event) => setQuickFilter(event.target.value as OverviewFilters['state'])}
          options={[
            { label: 'All servers', value: 'all' },
            { label: 'Stale only', value: 'stale' },
            { label: 'Errors only', value: 'error' }
          ]}
          value={quickFilter}
        />
        <ResetButton onClick={resetFilters} />
      </InlineToolbar>

      {isLoading ? <LoadingState label="Loading overview DTOs..." /> : null}
      {error ? <ErrorState message={error.message} /> : null}
      {showNoData ? <EmptyState body="Add a server or seed demo data to populate the fleet snapshot." title="No servers configured" /> : null}
      {showFilteredEmpty ? (
        <EmptyState body="Try a broader search or reset the local visibility controls." title="No servers match these filters" />
      ) : null}

      <div className="grid gap-4">
        {visibleRows.map((server) => (
          <article className="panel overflow-hidden p-5" key={server.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <button className="text-left" onClick={() => openServer(server.id)} type="button">
                <div className="flex items-center gap-3">
                  <h3 className="font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{server.name}</h3>
                  <StatusBadge status={server.status} />
                </div>
                <p className="mt-1 text-sm text-[color:var(--color-muted)]">{server.host}</p>
              </button>
              <button
                className="btn btn-secondary"
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate(server.id)}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-3">
              <MetricCard label="GPU total" value={server.gpuTotal} tone="accent" />
              <MetricCard label="Busy / free" value={`${server.busyGpuCount} / ${server.freeGpuCount}`} />
              <MetricCard label="Average GPU util" value={formatPercent(server.averageGpuUtilizationPercent)} />
              <MetricCard label="Average memory" value={formatPercent(server.averageMemoryUsagePercent)} />
              <MetricCard label="Max temperature" value={formatTemperature(server.maxTemperatureCelsius)} />
              <MetricCard label="Last success" value={formatTime(server.lastSuccessAt)} />
              <MetricCard label="Error type" value={formatUnknown(server.lastErrorType)} />
              <MetricCard label="Error message" value={sanitizeMessage(server.lastErrorMessage)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
