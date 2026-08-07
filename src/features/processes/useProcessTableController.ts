import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listProcesses, queryKeys } from '../../lib/api';
import { formatUnknown } from '../../lib/format';
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
import {
  ALL_PROCESS_FILTER_VALUE,
  defaultDirectionForSortKey,
  gpuFilterValue,
  isProcessRow,
  processRowKey,
  serverFilterValue,
  tableHeaderDirection,
  type ProcessRefreshFeedback,
  type ProcessTableController,
  type ProcessTableOption
} from './processTableModel';

type ProcessTableDefaultState = {
  readonly gpuFilter: string;
  readonly processKindFilter: string;
  readonly searchText: string;
  readonly serverFilter: string;
  readonly sortDirection: ProcessSortDirection;
  readonly sortKey: ProcessTableSortKey;
  readonly staleFilter: ProcessTableFilters['stale'];
  readonly viewMode: ProcessTableViewMode;
};

const DEFAULT_PROCESS_TABLE_STATE: ProcessTableDefaultState = {
  gpuFilter: ALL_PROCESS_FILTER_VALUE,
  processKindFilter: DEFAULT_PROCESS_TABLE_FILTERS.processKind ?? ALL_PROCESS_FILTER_VALUE,
  searchText: DEFAULT_PROCESS_TABLE_FILTERS.searchText,
  serverFilter: ALL_PROCESS_FILTER_VALUE,
  sortDirection: DEFAULT_PROCESS_TABLE_SORT.direction,
  sortKey: DEFAULT_PROCESS_TABLE_SORT.key,
  staleFilter: DEFAULT_PROCESS_TABLE_FILTERS.stale,
  viewMode: 'flat'
};

export const useProcessTableController = (): ProcessTableController => {
  const processesQuery = useQuery({ queryKey: queryKeys.processes, queryFn: listProcesses });
  const processRows = processesQuery.data ?? [];
  const focusFallbackRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [searchText, setSearchText] = useState(DEFAULT_PROCESS_TABLE_STATE.searchText);
  const [serverFilter, setServerFilter] = useState(DEFAULT_PROCESS_TABLE_STATE.serverFilter);
  const [gpuFilter, setGpuFilter] = useState(DEFAULT_PROCESS_TABLE_STATE.gpuFilter);
  const [processKindFilter, setProcessKindFilter] = useState(DEFAULT_PROCESS_TABLE_STATE.processKindFilter);
  const [staleFilter, setStaleFilter] = useState<ProcessTableFilters['stale']>(DEFAULT_PROCESS_TABLE_STATE.staleFilter);
  const [viewMode, setViewMode] = useState<ProcessTableViewMode>(DEFAULT_PROCESS_TABLE_STATE.viewMode);
  const [sortKey, setSortKey] = useState<ProcessTableSortKey>(DEFAULT_PROCESS_TABLE_STATE.sortKey);
  const [sortDirection, setSortDirection] = useState<ProcessSortDirection>(DEFAULT_PROCESS_TABLE_STATE.sortDirection);
  const [selectedProcessKey, setSelectedProcessKey] = useState<string | null>(null);
  const [returnFocusProcessKey, setReturnFocusProcessKey] = useState<string | null>(null);
  const [refreshFeedback, setRefreshFeedback] = useState<ProcessRefreshFeedback | null>(null);

  const serverOptions = useMemo<ProcessTableOption[]>(() => {
    const uniqueServers = Array.from(
      new Map(processRows.map((row) => [serverFilterValue(row.serverName, row.serverId), { id: row.serverId, name: row.serverName }])).values()
    ).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

    return uniqueServers.map((server) => ({
      id: server.id,
      label: `${server.name} (${server.id})`,
      name: server.name,
      value: serverFilterValue(server.name, server.id)
    }));
  }, [processRows]);

  const gpuOptions = useMemo<ProcessTableOption[]>(() => {
    const uniqueGpus = Array.from(
      new Map(processRows.map((row) => [gpuFilterValue(row.gpuIndex, row.gpuUuid), { index: row.gpuIndex, uuid: row.gpuUuid }])).values()
    ).sort((left, right) => left.index - right.index || left.uuid.localeCompare(right.uuid));

    return uniqueGpus.map((gpu) => ({
      index: gpu.index,
      label: `GPU ${gpu.index} · ${gpu.uuid}`,
      uuid: gpu.uuid,
      value: gpuFilterValue(gpu.index, gpu.uuid)
    }));
  }, [processRows]);

  const processKindOptions = useMemo(() => {
    const uniqueKinds = Array.from(new Set(processRows.map((row) => row.processKind))).sort((left, right) => left.localeCompare(right));
    return [{ label: 'All kinds', value: ALL_PROCESS_FILTER_VALUE }, ...uniqueKinds.map((kind) => ({ label: formatUnknown(kind), value: kind }))];
  }, [processRows]);

  useEffect(() => {
    if (serverFilter !== ALL_PROCESS_FILTER_VALUE && !serverOptions.some((option) => option.value === serverFilter)) {
      setServerFilter(ALL_PROCESS_FILTER_VALUE);
    }
  }, [serverFilter, serverOptions]);

  useEffect(() => {
    if (gpuFilter !== ALL_PROCESS_FILTER_VALUE && !gpuOptions.some((option) => option.value === gpuFilter)) {
      setGpuFilter(ALL_PROCESS_FILTER_VALUE);
    }
  }, [gpuFilter, gpuOptions]);

  const selectedServer = serverOptions.find((option) => option.value === serverFilter) ?? null;
  const selectedGpu = gpuOptions.find((option) => option.value === gpuFilter) ?? null;
  const filters = useMemo<ProcessTableFilters>(
    () => ({
      searchText,
      serverName: selectedServer?.name ?? null,
      gpuIndex: selectedGpu?.index ?? null,
      processKind: processKindFilter === ALL_PROCESS_FILTER_VALUE ? null : processKindFilter,
      stale: staleFilter
    }),
    [processKindFilter, searchText, selectedGpu?.index, selectedServer?.name, staleFilter]
  );
  const sortedRows = useMemo(() => {
    const utilityFilteredRows = filterProcessRows(processRows, filters);
    const exactPairRows = utilityFilteredRows.filter((row) => {
      const matchesServer = selectedServer === null || (row.serverId === selectedServer.id && row.serverName === selectedServer.name);
      const matchesGpu = selectedGpu === null || (row.gpuIndex === selectedGpu.index && row.gpuUuid === selectedGpu.uuid);
      return matchesServer && matchesGpu;
    });

    return sortProcessRows(exactPairRows, { key: sortKey, direction: sortDirection });
  }, [filters, processRows, selectedGpu, selectedServer, sortDirection, sortKey]);
  const visibleProcessRows = useMemo(() => getVisibleProcessRows(sortedRows, viewMode), [sortedRows, viewMode]);
  const visibleRows = useMemo(() => visibleProcessRows.filter(isProcessRow).map((item) => item.row), [visibleProcessRows]);
  const selectedProcess = useMemo(() => visibleRows.find((row) => processRowKey(row) === selectedProcessKey) ?? null, [selectedProcessKey, visibleRows]);

  useEffect(() => {
    if (selectedProcessKey !== null && selectedProcess === null) {
      setSelectedProcessKey(null);
      focusFallbackRef.current?.focus();
    }
  }, [selectedProcess, selectedProcessKey]);

  useEffect(() => {
    if (returnFocusProcessKey !== null && selectedProcess === null) {
      rowRefs.current.get(returnFocusProcessKey)?.focus();
      setReturnFocusProcessKey(null);
    }
  }, [returnFocusProcessKey, selectedProcess]);

  const openProcessDetails = (row: ProcessRowDto) => setSelectedProcessKey(processRowKey(row));
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
    setSearchText(DEFAULT_PROCESS_TABLE_STATE.searchText);
    setServerFilter(DEFAULT_PROCESS_TABLE_STATE.serverFilter);
    setGpuFilter(DEFAULT_PROCESS_TABLE_STATE.gpuFilter);
    setProcessKindFilter(DEFAULT_PROCESS_TABLE_STATE.processKindFilter);
    setStaleFilter(DEFAULT_PROCESS_TABLE_STATE.staleFilter);
    setViewMode(DEFAULT_PROCESS_TABLE_STATE.viewMode);
    setSortKey(DEFAULT_PROCESS_TABLE_STATE.sortKey);
    setSortDirection(DEFAULT_PROCESS_TABLE_STATE.sortDirection);
  };

  const handleRefreshRows = async () => {
    setRefreshFeedback({ label: 'Process row refresh', state: 'pending' });
    const refreshResult = await processesQuery.refetch();

    if (refreshResult.error) {
      setRefreshFeedback({ label: 'Process row refresh', message: `Refresh rows failed: ${refreshResult.error.message}`, state: 'error' });
      return;
    }

    setRefreshFeedback({ label: 'Process row refresh', message: `Refresh rows loaded ${(refreshResult.data ?? []).length} local rows.`, state: 'success' });
  };

  return {
    focusFallbackRef,
    filters,
    gpuOptions,
    gpuFilter,
    handleRefreshRows,
    handleRowKeyDown,
    handleSort,
    headerDirection: (key) => tableHeaderDirection(sortKey, key, sortDirection),
    isLoading: processesQuery.isLoading,
    closeProcessDetails,
    openProcessDetails,
    processKindFilter,
    processKindOptions,
    processRows,
    queryError: processesQuery.error,
    refreshFeedback,
    resetFilters,
    rowRefs,
    searchText,
    selectedGpuValue: selectedGpu === null ? ALL_PROCESS_FILTER_VALUE : gpuFilter,
    selectedProcess,
    selectedServerValue: selectedServer === null ? ALL_PROCESS_FILTER_VALUE : serverFilter,
    serverFilter,
    serverOptions,
    setGpuFilter,
    setProcessKindFilter,
    setSearchText,
    setServerFilter,
    setStaleFilter,
    setViewMode,
    sortedRows,
    staleFilter,
    viewMode,
    visibleProcessRows,
    visibleRows
  };
};
