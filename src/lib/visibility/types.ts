import type { ProcessRowDto } from '../types';

export type SortDirection = 'asc' | 'desc';

export type ProcessTableViewMode = 'flat' | 'parentGrouped' | 'userGrouped';

export interface ProcessTableFilters {
  searchText: string;
  serverName: string | null;
  gpuIndex: number | null;
  processKind: string | null;
  stale: 'all' | 'current' | 'stale';
}

export interface OverviewFilters {
  searchText: string;
  status: string | null;
  state: 'all' | 'stale' | 'error';
}

export type ProcessTableSortKey =
  | 'serverName'
  | 'gpuIndex'
  | 'pid'
  | 'runtimeSeconds'
  | 'username'
  | 'gpuMemoryUsedMiB'
  | 'gpuUtilizationPercent'
  | 'gpuSmUtilizationPercent'
  | 'gpuMemoryUtilizationPercent'
  | 'cpuPercent'
  | 'hostMemoryUsedMiB'
  | 'command';

export interface VisibleProcessDataRow {
  kind: 'process';
  depth: number;
  row: ProcessRowDto;
}

export interface VisibleProcessSectionRow {
  kind: 'section';
  key: string;
  label: string;
  processCount: number;
  serverName: string;
  usernameLabel: string;
}

export type VisibleProcessRow = VisibleProcessDataRow | VisibleProcessSectionRow;

export type OverviewSortKey = 'name' | 'host' | 'status' | 'lastSuccessAt' | 'lastErrorType' | 'lastErrorMessage';

export interface SortSpec<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export const DEFAULT_PROCESS_TABLE_SORT: SortSpec<ProcessTableSortKey> = {
  key: 'gpuMemoryUsedMiB',
  direction: 'desc'
};

export const DEFAULT_PROCESS_TABLE_FILTERS: ProcessTableFilters = {
  searchText: '',
  serverName: null,
  gpuIndex: null,
  processKind: null,
  stale: 'all'
};

export const DEFAULT_OVERVIEW_FILTERS: OverviewFilters = {
  searchText: '',
  status: null,
  state: 'all'
};
