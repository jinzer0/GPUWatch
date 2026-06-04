import { formatCommand, sanitizeMessage } from './format';
import type { ProcessRowDto, ServerOverviewDto } from './types';

export type SortDirection = 'asc' | 'desc';

export type ProcessTableViewMode = 'flat' | 'parentGrouped';

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

export interface VisibleProcessRow {
  depth: number;
  row: ProcessRowDto;
}

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

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const includesText = (value: string | number | null | undefined, searchText: string) => {
  if (!searchText) {
    return true;
  }
  return String(value ?? '').toLowerCase().includes(searchText);
};

const compareNullableStrings = (left: string | null | undefined, right: string | null | undefined, direction: SortDirection) => {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  const comparison = left.localeCompare(right);
  return direction === 'desc' ? -comparison : comparison;
};

const compareNullableNumbers = (left: number | null | undefined, right: number | null | undefined, direction: SortDirection) => {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  const comparison = left - right;
  return direction === 'desc' ? -comparison : comparison;
};

const compareNullableCommands = (left: string | null, right: string | null, direction: SortDirection) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  const comparison = formatCommand(left).localeCompare(formatCommand(right));
  return direction === 'desc' ? -comparison : comparison;
};

const compareProcessRows = (left: ProcessRowDto, right: ProcessRowDto, sort: SortSpec<ProcessTableSortKey>) => {
  const primaryComparison = (() => {
    switch (sort.key) {
      case 'serverName':
        return compareNullableStrings(left.serverName, right.serverName, sort.direction);
      case 'gpuIndex':
        return compareNullableNumbers(left.gpuIndex, right.gpuIndex, sort.direction);
      case 'pid':
        return compareNullableNumbers(left.pid, right.pid, sort.direction);
      case 'runtimeSeconds':
        return compareNullableNumbers(left.runtimeSeconds, right.runtimeSeconds, sort.direction);
      case 'username':
        return compareNullableStrings(left.username, right.username, sort.direction);
      case 'gpuMemoryUsedMiB':
        return compareNullableNumbers(left.gpuMemoryUsedMiB, right.gpuMemoryUsedMiB, sort.direction);
      case 'gpuUtilizationPercent':
        return compareNullableNumbers(left.gpuUtilizationPercent, right.gpuUtilizationPercent, sort.direction);
      case 'gpuSmUtilizationPercent':
        return compareNullableNumbers(left.gpuSmUtilizationPercent, right.gpuSmUtilizationPercent, sort.direction);
      case 'gpuMemoryUtilizationPercent':
        return compareNullableNumbers(left.gpuMemoryUtilizationPercent, right.gpuMemoryUtilizationPercent, sort.direction);
      case 'cpuPercent':
        return compareNullableNumbers(left.cpuPercent, right.cpuPercent, sort.direction);
      case 'hostMemoryUsedMiB':
        return compareNullableNumbers(left.hostMemoryUsedMiB, right.hostMemoryUsedMiB, sort.direction);
      case 'command':
        return compareNullableCommands(left.command, right.command, sort.direction);
    }
  })();

  if (primaryComparison !== 0) {
    return primaryComparison;
  }

  const serverNameComparison = compareNullableStrings(left.serverName, right.serverName, 'asc');
  if (serverNameComparison !== 0) {
    return serverNameComparison;
  }

  const gpuIndexComparison = compareNullableNumbers(left.gpuIndex, right.gpuIndex, 'asc');
  if (gpuIndexComparison !== 0) {
    return gpuIndexComparison;
  }

  const pidComparison = compareNullableNumbers(left.pid, right.pid, 'asc');
  if (pidComparison !== 0) {
    return pidComparison;
  }

  return compareNullableCommands(left.command, right.command, 'asc');
};

const compareOverviewRows = (left: ServerOverviewDto, right: ServerOverviewDto, sort: SortSpec<OverviewSortKey>) => {
  const primaryComparison = (() => {
    switch (sort.key) {
      case 'name':
        return compareNullableStrings(left.name, right.name, sort.direction);
      case 'host':
        return compareNullableStrings(left.host, right.host, sort.direction);
      case 'status':
        return compareNullableStrings(left.status, right.status, sort.direction);
      case 'lastSuccessAt':
        return compareNullableStrings(left.lastSuccessAt, right.lastSuccessAt, sort.direction);
      case 'lastErrorType':
        return compareNullableStrings(left.lastErrorType, right.lastErrorType, sort.direction);
      case 'lastErrorMessage':
        return compareNullableStrings(sanitizeMessage(left.lastErrorMessage), sanitizeMessage(right.lastErrorMessage), sort.direction);
    }
  })();

  if (primaryComparison !== 0) {
    return primaryComparison;
  }

  const nameComparison = compareNullableStrings(left.name, right.name, 'asc');
  if (nameComparison !== 0) {
    return nameComparison;
  }

  const hostComparison = compareNullableStrings(left.host, right.host, 'asc');
  if (hostComparison !== 0) {
    return hostComparison;
  }

  return compareNullableStrings(left.status, right.status, 'asc');
};

const stableSort = <T>(rows: T[], compare: (left: T, right: T) => number) =>
  rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => compare(left.row, right.row) || left.index - right.index)
    .map(({ row }) => row);

const serverPidKey = (row: Pick<ProcessRowDto, 'pid' | 'serverId'>) => `${row.serverId}::${row.pid}`;

const serverGpuPidKey = (row: Pick<ProcessRowDto, 'gpuUuid' | 'pid' | 'serverId'>) => `${row.serverId}::${row.gpuUuid}::${row.pid}`;

const processObjectKey = (row: ProcessRowDto) => `${row.serverId}::${row.gpuUuid}::${row.pid}`;

const sortChildrenByPid = (rows: ProcessRowDto[]) => stableSort(rows, (left, right) => compareNullableNumbers(left.pid, right.pid, 'asc'));

export const getVisibleProcessRows = (rows: ProcessRowDto[], viewMode: ProcessTableViewMode): VisibleProcessRow[] => {
  if (viewMode === 'flat') {
    return rows.map((row) => ({ depth: 0, row }));
  }

  const parentByPid = new Map<string, ProcessRowDto>();
  const parentByGpuPid = new Map<string, ProcessRowDto>();
  rows.forEach((row) => {
    const key = serverPidKey(row);
    if (!parentByPid.has(key)) {
      parentByPid.set(key, row);
    }
    parentByGpuPid.set(serverGpuPidKey(row), row);
  });

  const childrenByParentKey = new Map<string, ProcessRowDto[]>();
  const groupedChildKeys = new Set<string>();

  rows.forEach((row) => {
    if (row.parentPid === null || row.parentPid === undefined) {
      return;
    }

    const parent = parentByGpuPid.get(`${row.serverId}::${row.gpuUuid}::${row.parentPid}`) ?? parentByPid.get(`${row.serverId}::${row.parentPid}`);
    if (parent === undefined || parent === row) {
      return;
    }

    const childKey = processObjectKey(row);
    const parentKey = processObjectKey(parent);
    if (childKey === parentKey) {
      return;
    }

    const children = childrenByParentKey.get(parentKey) ?? [];
    children.push(row);
    childrenByParentKey.set(parentKey, children);
    groupedChildKeys.add(childKey);
  });

  const flattenedRows: VisibleProcessRow[] = [];
  const visitedKeys = new Set<string>();

  const appendRow = (row: ProcessRowDto, depth: number) => {
    const key = processObjectKey(row);
    if (visitedKeys.has(key)) {
      return;
    }

    visitedKeys.add(key);
    flattenedRows.push({ depth, row });

    const children = childrenByParentKey.get(key) ?? [];
    sortChildrenByPid(children).forEach((child) => appendRow(child, depth + 1));
  };

  rows.forEach((row) => {
    if (!groupedChildKeys.has(processObjectKey(row))) {
      appendRow(row, 0);
    }
  });

  rows.forEach((row) => {
    if (!visitedKeys.has(processObjectKey(row))) {
      appendRow(row, 0);
    }
  });

  return flattenedRows;
};

export const filterProcessRows = (rows: ProcessRowDto[], filters: ProcessTableFilters) => {
  const searchText = normalizeSearchText(filters.searchText);

  return rows.filter((row) => {
    if (filters.serverName !== null && row.serverName.toLowerCase() !== filters.serverName.toLowerCase()) {
      return false;
    }
    if (filters.gpuIndex !== null && row.gpuIndex !== filters.gpuIndex) {
      return false;
    }
    if (filters.processKind !== null && row.processKind.toLowerCase() !== filters.processKind.toLowerCase()) {
      return false;
    }
    if (filters.stale === 'current' && row.stale) {
      return false;
    }
    if (filters.stale === 'stale' && !row.stale) {
      return false;
    }

    if (!searchText) {
      return true;
    }

    return [
      row.serverName,
      row.pid,
      row.username,
      row.gpuIndex,
      row.gpuUuid,
      row.processKind,
      formatCommand(row.command)
    ].some((value) => includesText(value, searchText));
  });
};

export const filterOverviewRows = (rows: ServerOverviewDto[], filters: OverviewFilters) => {
  const searchText = normalizeSearchText(filters.searchText);

  return rows.filter((row) => {
    if (filters.status !== null && row.status.toLowerCase() !== filters.status.toLowerCase()) {
      return false;
    }
    if (filters.state === 'stale' && row.status !== 'stale') {
      return false;
    }
    if (filters.state === 'error') {
      const hasErrorStatus = row.status.toLowerCase().includes('error');
      const hasErrorMetadata = row.lastErrorType !== null || row.lastErrorMessage !== null;
      if (!hasErrorStatus && !hasErrorMetadata) {
        return false;
      }
    }

    if (!searchText) {
      return true;
    }

    return [row.name, row.host, row.status, row.lastErrorType, sanitizeMessage(row.lastErrorMessage)].some((value) => includesText(value, searchText));
  });
};

export const sortProcessRows = (rows: ProcessRowDto[], sort: SortSpec<ProcessTableSortKey>) => stableSort(rows, (left, right) => compareProcessRows(left, right, sort));

export const sortOverviewRows = (rows: ServerOverviewDto[], sort: SortSpec<OverviewSortKey>) => stableSort(rows, (left, right) => compareOverviewRows(left, right, sort));
