import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  InlineToolbar,
  LabeledSelect,
  LabeledTextInput,
  LoadingState,
  ResetButton,
  RightDrawer,
  SortableTableHeader,
  StatusBadge,
  type LabeledSelectOption,
  type SortDirection as HeaderSortDirection
} from '../../components/ui';
import { listProcesses, queryKeys } from '../../lib/api';
import { formatCommand, formatMiB, formatPercent, formatRuntimeSeconds, formatUnknown } from '../../lib/format';
import {
  DEFAULT_PROCESS_TABLE_FILTERS,
  DEFAULT_PROCESS_TABLE_SORT,
  filterProcessRows,
  getVisibleProcessRows,
  sortProcessRows,
  type ProcessTableFilters,
  type ProcessTableSortKey,
  type ProcessTableViewMode,
  type SortDirection as ProcessSortDirection
} from '../../lib/visibility';
import type { ProcessRowDto } from '../../lib/types';

const ALL_FILTER_VALUE = 'all';

const metricSortKeys = new Set<ProcessTableSortKey>([
  'runtimeSeconds',
  'gpuMemoryUsedMiB',
  'gpuUtilizationPercent',
  'gpuSmUtilizationPercent',
  'gpuMemoryUtilizationPercent',
  'cpuPercent',
  'hostMemoryUsedMiB'
]);

const defaultDirectionForSortKey = (key: ProcessTableSortKey): ProcessSortDirection => (metricSortKeys.has(key) ? 'desc' : 'asc');

const tableHeaderDirection = (activeKey: ProcessTableSortKey, sortKey: ProcessTableSortKey, direction: ProcessSortDirection): HeaderSortDirection => {
  if (activeKey !== sortKey) {
    return null;
  }
  return direction === 'asc' ? 'ascending' : 'descending';
};

const serverFilterValue = (serverName: string, serverId: string) => `${serverName}::${serverId}`;

const gpuFilterValue = (gpuIndex: number, gpuUuid: string) => `${gpuIndex}::${gpuUuid}`;

const processRowKey = (row: ProcessRowDto) => `${row.serverId}-${row.gpuUuid}-${row.pid}`;

const processStatus = (row: ProcessRowDto) => (row.stale ? 'stale' : 'current');

const pidCellSpacingClass = (depth: number) => {
  if (depth <= 0) {
    return 'px-4 py-3';
  }
  if (depth === 1) {
    return 'py-3 pl-8 pr-4';
  }
  return 'py-3 pl-12 pr-4';
};

const ProcessDetailField = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="surface p-3">
    <dt className="metric-label">{label}</dt>
    <dd className="mt-2 break-words text-sm font-semibold text-[color:var(--color-text)]">{children}</dd>
  </div>
);

const ProcessDetailDrawer = ({ onClose, row }: { onClose: () => void; row: ProcessRowDto }) => (
  <RightDrawer ariaLabel="Process details" onClose={onClose} title={`PID ${row.pid}`}>
    <div className="surface border-[color:var(--color-accent)] bg-[var(--color-accent-soft)] p-4 text-sm font-semibold text-[color:var(--color-accent)]">
      Read-only view; no process actions are available.
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <ProcessDetailField label="Server">{formatUnknown(row.serverName)}</ProcessDetailField>
      <ProcessDetailField label="Status">
        <StatusBadge status={processStatus(row)} />
      </ProcessDetailField>
      <ProcessDetailField label="GPU index">GPU {formatUnknown(row.gpuIndex)}</ProcessDetailField>
      <ProcessDetailField label="GPU UUID">{formatUnknown(row.gpuUuid)}</ProcessDetailField>
      <ProcessDetailField label="PID">{formatUnknown(row.pid)}</ProcessDetailField>
      <ProcessDetailField label="Parent PID">{formatUnknown(row.parentPid)}</ProcessDetailField>
      <ProcessDetailField label="Runtime">{formatRuntimeSeconds(row.runtimeSeconds)}</ProcessDetailField>
      <ProcessDetailField label="Username">{formatUnknown(row.username)}</ProcessDetailField>
      <ProcessDetailField label="Process kind">{formatUnknown(row.processKind)}</ProcessDetailField>
      <ProcessDetailField label="GPU memory">{formatMiB(row.gpuMemoryUsedMiB)}</ProcessDetailField>
      <ProcessDetailField label="GPU utilization">{formatPercent(row.gpuUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="SM util">{formatPercent(row.gpuSmUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="Memory util">{formatPercent(row.gpuMemoryUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="Encoder util">{formatPercent(row.gpuEncoderUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="Decoder util">{formatPercent(row.gpuDecoderUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="CPU">{formatPercent(row.cpuPercent)}</ProcessDetailField>
      <ProcessDetailField label="Host memory">{formatMiB(row.hostMemoryUsedMiB)}</ProcessDetailField>
      <div className="surface col-span-2 p-3">
        <dt className="metric-label">Command</dt>
        <dd className="mt-2 break-words font-mono text-sm leading-6 text-[color:var(--color-muted)]" title={formatCommand(row.command)}>
          {formatCommand(row.command)}
        </dd>
      </div>
    </dl>
  </RightDrawer>
);

export const ProcessTableScreen = () => {
  const processesQuery = useQuery({ queryKey: queryKeys.processes, queryFn: listProcesses });
  const rows = processesQuery.data ?? [];
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [searchText, setSearchText] = useState(DEFAULT_PROCESS_TABLE_FILTERS.searchText);
  const [serverFilter, setServerFilter] = useState(ALL_FILTER_VALUE);
  const [gpuFilter, setGpuFilter] = useState(ALL_FILTER_VALUE);
  const [processKindFilter, setProcessKindFilter] = useState(DEFAULT_PROCESS_TABLE_FILTERS.processKind ?? ALL_FILTER_VALUE);
  const [staleFilter, setStaleFilter] = useState<ProcessTableFilters['stale']>(DEFAULT_PROCESS_TABLE_FILTERS.stale);
  const [viewMode, setViewMode] = useState<ProcessTableViewMode>('flat');
  const [sortKey, setSortKey] = useState<ProcessTableSortKey>(DEFAULT_PROCESS_TABLE_SORT.key);
  const [sortDirection, setSortDirection] = useState<ProcessSortDirection>(DEFAULT_PROCESS_TABLE_SORT.direction);
  const [selectedProcessKey, setSelectedProcessKey] = useState<string | null>(null);
  const [returnFocusProcessKey, setReturnFocusProcessKey] = useState<string | null>(null);

  const serverOptions = useMemo(() => {
    const uniqueServers = Array.from(
      new Map(rows.map((row) => [serverFilterValue(row.serverName, row.serverId), { id: row.serverId, name: row.serverName }])).values()
    ).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

    return uniqueServers.map((server) => ({
      id: server.id,
      label: `${server.name} (${server.id})`,
      name: server.name,
      value: serverFilterValue(server.name, server.id)
    }));
  }, [rows]);

  const gpuOptions = useMemo(() => {
    const uniqueGpus = Array.from(
      new Map(rows.map((row) => [gpuFilterValue(row.gpuIndex, row.gpuUuid), { index: row.gpuIndex, uuid: row.gpuUuid }])).values()
    ).sort((left, right) => left.index - right.index || left.uuid.localeCompare(right.uuid));

    return uniqueGpus.map((gpu) => ({
      index: gpu.index,
      label: `GPU ${gpu.index} · ${gpu.uuid}`,
      uuid: gpu.uuid,
      value: gpuFilterValue(gpu.index, gpu.uuid)
    }));
  }, [rows]);

  const processKindOptions = useMemo<LabeledSelectOption[]>(() => {
    const uniqueKinds = Array.from(new Set(rows.map((row) => row.processKind))).sort((left, right) => left.localeCompare(right));
    return [
      { label: 'All kinds', value: ALL_FILTER_VALUE },
      ...uniqueKinds.map((kind) => ({ label: formatUnknown(kind), value: kind }))
    ];
  }, [rows]);

  const selectedServer = serverOptions.find((option) => option.value === serverFilter) ?? null;
  const selectedGpu = gpuOptions.find((option) => option.value === gpuFilter) ?? null;

  const filters = useMemo<ProcessTableFilters>(
    () => ({
      searchText,
      serverName: selectedServer?.name ?? null,
      gpuIndex: selectedGpu?.index ?? null,
      processKind: processKindFilter === ALL_FILTER_VALUE ? null : processKindFilter,
      stale: staleFilter
    }),
    [processKindFilter, searchText, selectedGpu?.index, selectedServer?.name, staleFilter]
  );

  const sortedRows = useMemo(() => {
    const utilityFilteredRows = filterProcessRows(rows, filters);
    const exactPairRows = utilityFilteredRows.filter((row) => {
      const matchesServer = selectedServer === null || (row.serverId === selectedServer.id && row.serverName === selectedServer.name);
      const matchesGpu = selectedGpu === null || (row.gpuIndex === selectedGpu.index && row.gpuUuid === selectedGpu.uuid);
      return matchesServer && matchesGpu;
    });

    return sortProcessRows(exactPairRows, { key: sortKey, direction: sortDirection });
  }, [filters, rows, selectedGpu, selectedServer, sortDirection, sortKey]);

  const visibleProcessRows = useMemo(() => getVisibleProcessRows(sortedRows, viewMode), [sortedRows, viewMode]);
  const visibleRows = useMemo(() => visibleProcessRows.map((item) => item.row), [visibleProcessRows]);

  const selectedProcess = useMemo(
    () => visibleRows.find((row) => processRowKey(row) === selectedProcessKey) ?? null,
    [selectedProcessKey, visibleRows]
  );

  useEffect(() => {
    if (selectedProcessKey !== null && selectedProcess === null) {
      setSelectedProcessKey(null);
    }
  }, [selectedProcess, selectedProcessKey]);

  useEffect(() => {
    if (returnFocusProcessKey !== null && selectedProcess === null) {
      rowRefs.current.get(returnFocusProcessKey)?.focus();
      setReturnFocusProcessKey(null);
    }
  }, [returnFocusProcessKey, selectedProcess]);

  useEffect(() => {
    if (selectedProcess !== null) {
      document.querySelector<HTMLButtonElement>('[aria-label="Close drawer"]')?.focus();
    }
  }, [selectedProcess]);

  const openProcessDetails = (row: ProcessRowDto) => {
    setSelectedProcessKey(processRowKey(row));
  };

  const closeProcessDetails = () => {
    setReturnFocusProcessKey(selectedProcessKey);
    setSelectedProcessKey(null);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: ProcessRowDto) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const currentIndex = visibleRows.findIndex((visibleRow) => processRowKey(visibleRow) === processRowKey(row));
      const nextIndex = event.key === 'ArrowDown' ? Math.min(currentIndex + 1, visibleRows.length - 1) : Math.max(currentIndex - 1, 0);
      rowRefs.current.get(processRowKey(visibleRows[nextIndex]))?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProcessDetails(row);
    }
  };

  const handleSort = (nextKey: ProcessTableSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection(defaultDirectionForSortKey(nextKey));
  };

  const resetFilters = () => {
    setSearchText(DEFAULT_PROCESS_TABLE_FILTERS.searchText);
    setServerFilter(ALL_FILTER_VALUE);
    setGpuFilter(ALL_FILTER_VALUE);
    setProcessKindFilter(ALL_FILTER_VALUE);
    setStaleFilter(DEFAULT_PROCESS_TABLE_FILTERS.stale);
    setViewMode('flat');
    setSortKey(DEFAULT_PROCESS_TABLE_SORT.key);
    setSortDirection(DEFAULT_PROCESS_TABLE_SORT.direction);
  };

  const toolbar = (
    <InlineToolbar label="Process filters" summary={`Showing ${visibleRows.length} of ${rows.length} processes`}>
      <LabeledTextInput id="process-search" label="Search" onChange={(event) => setSearchText(event.target.value)} value={searchText} />
      <LabeledSelect
        id="process-server-filter"
        label="Server"
        onChange={(event) => setServerFilter(event.target.value)}
        options={[{ label: 'All servers', value: ALL_FILTER_VALUE }, ...serverOptions]}
        value={selectedServer === null ? ALL_FILTER_VALUE : serverFilter}
      />
      <LabeledSelect
        id="process-gpu-filter"
        label="GPU"
        onChange={(event) => setGpuFilter(event.target.value)}
        options={[{ label: 'All GPUs', value: ALL_FILTER_VALUE }, ...gpuOptions]}
        value={selectedGpu === null ? ALL_FILTER_VALUE : gpuFilter}
      />
      <LabeledSelect id="process-kind-filter" label="Kind" onChange={(event) => setProcessKindFilter(event.target.value)} options={processKindOptions} value={processKindFilter} />
      <LabeledSelect
        id="process-stale-filter"
        label="Freshness"
        onChange={(event) => setStaleFilter(event.target.value as ProcessTableFilters['stale'])}
        options={[
          { label: 'All rows', value: 'all' },
          { label: 'Current only', value: 'current' },
          { label: 'Stale only', value: 'stale' }
        ]}
        value={staleFilter}
      />
      <LabeledSelect
        id="process-view-mode"
        label="View"
        onChange={(event) => setViewMode(event.target.value as ProcessTableViewMode)}
        options={[
          { label: 'Flat', value: 'flat' },
          { label: 'Parent grouped', value: 'parentGrouped' }
        ]}
        value={viewMode}
      />
      <ResetButton onClick={resetFilters} />
    </InlineToolbar>
  );

  const headerDirection = (key: ProcessTableSortKey) => tableHeaderDirection(sortKey, key, sortDirection);

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="eyebrow">Process Table</div>
        <h2 className="mt-2 font-[var(--font-display)] text-4xl font-black tracking-[-0.08em]">GPU memory ledger</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
          Flattened backend process rows, default sorted by GPU memory descending with stale snapshot rows visibly marked.
        </p>
      </div>

      {processesQuery.isLoading ? (
        <LoadingState label="Loading process DTO rows..." />
      ) : processesQuery.error ? (
        <ErrorState message={processesQuery.error.message} />
      ) : (
        <>
          {toolbar}
          {rows.length === 0 ? (
            <EmptyState title="No processes" body="No latest successful GPU process rows are currently available." />
          ) : visibleRows.length === 0 ? (
            <EmptyState title="No processes match filters" body="Adjust or reset the Process Table filters to show rows again." />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead className="table-head bg-white/5">
                  <tr>
                    <SortableTableHeader direction={headerDirection('serverName')} label="Server" onSort={() => handleSort('serverName')} />
                    <SortableTableHeader direction={headerDirection('gpuIndex')} label="GPU" onSort={() => handleSort('gpuIndex')} />
                    <SortableTableHeader direction={headerDirection('pid')} label="PID" onSort={() => handleSort('pid')} />
                    <SortableTableHeader direction={headerDirection('runtimeSeconds')} label="Runtime" onSort={() => handleSort('runtimeSeconds')} />
                    <SortableTableHeader direction={headerDirection('username')} label="User" onSort={() => handleSort('username')} />
                    <SortableTableHeader direction={headerDirection('gpuMemoryUsedMiB')} label="GPU memory" onSort={() => handleSort('gpuMemoryUsedMiB')} />
                    <SortableTableHeader direction={headerDirection('gpuUtilizationPercent')} label="GPU util" onSort={() => handleSort('gpuUtilizationPercent')} />
                    <SortableTableHeader direction={headerDirection('gpuSmUtilizationPercent')} label="SM util" onSort={() => handleSort('gpuSmUtilizationPercent')} />
                    <SortableTableHeader direction={headerDirection('gpuMemoryUtilizationPercent')} label="Memory util" onSort={() => handleSort('gpuMemoryUtilizationPercent')} />
                    <SortableTableHeader direction={headerDirection('cpuPercent')} label="CPU" onSort={() => handleSort('cpuPercent')} />
                    <SortableTableHeader direction={headerDirection('hostMemoryUsedMiB')} label="Host memory" onSort={() => handleSort('hostMemoryUsedMiB')} />
                    <SortableTableHeader direction={headerDirection('command')} label="Command" onSort={() => handleSort('command')} />
                  </tr>
                </thead>
                <tbody>
                  {visibleProcessRows.map(({ depth, row }) => (
                    <tr
                      aria-label={`Open process details for PID ${row.pid} on ${row.serverName}`}
                      className={`cursor-pointer border-t border-[color:var(--color-border)] outline-none transition hover:bg-[var(--color-accent-soft)] focus-visible:bg-[var(--color-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${row.stale ? 'row-stale' : 'bg-transparent'}`}
                      key={processRowKey(row)}
                      onClick={() => openProcessDetails(row)}
                      onKeyDown={(event) => handleRowKeyDown(event, row)}
                      ref={(element) => {
                        const key = processRowKey(row);
                        if (element) {
                          rowRefs.current.set(key, element);
                          return;
                        }
                        rowRefs.current.delete(key);
                      }}
                      tabIndex={0}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.serverName}</div>
                        {row.stale ? <StatusBadge status="stale" /> : null}
                      </td>
                      <td className="px-4 py-3 font-[var(--font-display)]">{row.gpuIndex}</td>
                      <td className={pidCellSpacingClass(depth)}>
                        <div className="font-[var(--font-display)]">{row.pid}</div>
                        {row.parentPid !== null && row.parentPid !== undefined ? (
                          <div className="mt-1 text-xs text-[color:var(--color-muted)]">Parent PID {row.parentPid}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{formatRuntimeSeconds(row.runtimeSeconds)}</td>
                      <td className="px-4 py-3">{formatUnknown(row.username)}</td>
                      <td className="px-4 py-3 font-semibold text-[color:var(--color-accent)]">{formatMiB(row.gpuMemoryUsedMiB)}</td>
                      <td className="px-4 py-3">{formatPercent(row.gpuUtilizationPercent)}</td>
                      <td className="px-4 py-3">{formatPercent(row.gpuSmUtilizationPercent)}</td>
                      <td className="px-4 py-3">{formatPercent(row.gpuMemoryUtilizationPercent)}</td>
                      <td className="px-4 py-3">{formatPercent(row.cpuPercent)}</td>
                      <td className="px-4 py-3">{formatMiB(row.hostMemoryUsedMiB)}</td>
                      <td className="max-w-sm truncate px-4 py-3 text-[color:var(--color-muted)]" title={formatCommand(row.command)}>
                        {formatCommand(row.command)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {selectedProcess ? <ProcessDetailDrawer onClose={closeProcessDetails} row={selectedProcess} /> : null}
    </section>
  );
};
