import type { KeyboardEvent, RefObject } from 'react';

import type { LabeledSelectOption, SortDirection as HeaderSortDirection } from '../../components/ui';
import type {
  ProcessTableFilters,
  ProcessTableSortKey,
  ProcessTableViewMode,
  SortDirection as ProcessSortDirection,
  VisibleProcessRow
} from '../../lib/visibility';
import type { ProcessRowDto } from '../../lib/types';

export const ALL_PROCESS_FILTER_VALUE = 'all';

const metricSortKeys = new Set<ProcessTableSortKey>([
  'runtimeSeconds',
  'gpuMemoryUsedMiB',
  'gpuUtilizationPercent',
  'gpuSmUtilizationPercent',
  'gpuMemoryUtilizationPercent',
  'cpuPercent',
  'hostMemoryUsedMiB'
]);

export type ProcessRefreshFeedback =
  | {
      readonly label: string;
      readonly state: 'pending';
    }
  | {
      readonly label: string;
      readonly message: string;
      readonly state: 'error' | 'success';
    };

export type ProcessTableOption = LabeledSelectOption & {
  readonly id?: string;
  readonly index?: number;
  readonly name?: string;
  readonly uuid?: string;
};

export type ProcessTableController = {
  readonly filters: ProcessTableFilters;
  readonly gpuOptions: readonly ProcessTableOption[];
  readonly gpuFilter: string;
  readonly handleRefreshRows: () => Promise<void>;
  readonly handleRowKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, row: ProcessRowDto) => void;
  readonly handleSort: (nextKey: ProcessTableSortKey) => void;
  readonly headerDirection: (key: ProcessTableSortKey) => HeaderSortDirection;
  readonly isLoading: boolean;
  readonly closeProcessDetails: () => void;
  readonly openProcessDetails: (row: ProcessRowDto) => void;
  readonly processKindFilter: string;
  readonly processKindOptions: readonly LabeledSelectOption[];
  readonly processRows: readonly ProcessRowDto[];
  readonly queryError: Error | null;
  readonly refreshFeedback: ProcessRefreshFeedback | null;
  readonly resetFilters: () => void;
  readonly rowRefs: RefObject<Map<string, HTMLTableRowElement>>;
  readonly searchText: string;
  readonly selectedGpuValue: string;
  readonly selectedProcess: ProcessRowDto | null;
  readonly selectedServerValue: string;
  readonly serverFilter: string;
  readonly serverOptions: readonly ProcessTableOption[];
  readonly setGpuFilter: (value: string) => void;
  readonly setProcessKindFilter: (value: string) => void;
  readonly setSearchText: (value: string) => void;
  readonly setServerFilter: (value: string) => void;
  readonly setStaleFilter: (value: ProcessTableFilters['stale']) => void;
  readonly setViewMode: (value: ProcessTableViewMode) => void;
  readonly sortedRows: readonly ProcessRowDto[];
  readonly staleFilter: ProcessTableFilters['stale'];
  readonly viewMode: ProcessTableViewMode;
  readonly visibleProcessRows: readonly VisibleProcessRow[];
  readonly visibleRows: readonly ProcessRowDto[];
};

export const defaultDirectionForSortKey = (key: ProcessTableSortKey): ProcessSortDirection => (metricSortKeys.has(key) ? 'desc' : 'asc');

export const tableHeaderDirection = (activeKey: ProcessTableSortKey, sortKey: ProcessTableSortKey, direction: ProcessSortDirection): HeaderSortDirection => {
  if (activeKey !== sortKey) {
    return null;
  }
  return direction === 'asc' ? 'ascending' : 'descending';
};

export const serverFilterValue = (serverName: string, serverId: string) => `${serverName}::${serverId}`;

export const gpuFilterValue = (gpuIndex: number, gpuUuid: string) => `${gpuIndex}::${gpuUuid}`;

export const processRowKey = (row: ProcessRowDto) => `${row.serverId}-${row.gpuUuid}-${row.pid}`;

export const processStatus = (row: ProcessRowDto) => (row.stale ? 'stale' : 'current');

export const isProcessRow = (item: VisibleProcessRow): item is Extract<VisibleProcessRow, { kind: 'process' }> => item.kind === 'process';

export const pidCellSpacingClass = (depth: number) => {
  if (depth <= 0) {
    return 'px-4 py-3';
  }
  if (depth === 1) {
    return 'py-3 pl-8 pr-4';
  }
  return 'py-3 pl-12 pr-4';
};

export const parseProcessStaleFilter = (value: string): ProcessTableFilters['stale'] => {
  if (value === 'current' || value === 'stale') {
    return value;
  }
  return 'all';
};

export const parseProcessViewMode = (value: string): ProcessTableViewMode => {
  if (value === 'parentGrouped' || value === 'userGrouped') {
    return value;
  }
  return 'flat';
};
