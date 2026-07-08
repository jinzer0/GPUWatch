import { formatCommand } from '../format';
import type { ProcessRowDto } from '../types';
import { compareNullableNumbers, compareNullableStrings, stableSort } from './shared';
import type { ProcessTableSortKey, SortDirection, SortSpec } from './types';

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

export const sortProcessRows = (rows: ProcessRowDto[], sort: SortSpec<ProcessTableSortKey>) => stableSort(rows, (left, right) => compareProcessRows(left, right, sort));
