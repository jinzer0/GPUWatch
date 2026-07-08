import type { ProcessRowDto } from '../types';
import { compareNullableNumbers, stableSort } from './shared';
import { processObjectKey, serverGpuPidKey, serverPidKey } from './rowKeys';
import type { VisibleProcessDataRow } from './types';

const sortChildrenByPid = (rows: ProcessRowDto[]) => stableSort(rows, (left, right) => compareNullableNumbers(left.pid, right.pid, 'asc'));

export const getParentGroupedProcessRows = (rows: ProcessRowDto[]): VisibleProcessDataRow[] => {
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

  const flattenedRows: VisibleProcessDataRow[] = [];
  const visitedKeys = new Set<string>();

  const appendRow = (row: ProcessRowDto, depth: number) => {
    const key = processObjectKey(row);
    if (visitedKeys.has(key)) {
      return;
    }

    visitedKeys.add(key);
    flattenedRows.push({ depth, kind: 'process', row });

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
