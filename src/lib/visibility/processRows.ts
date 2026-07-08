import type { ProcessRowDto } from '../types';
import { getParentGroupedProcessRows } from './parentGrouping';
import { getUserGroupedProcessRows } from './userGrouping';
import type { ProcessTableViewMode, VisibleProcessDataRow, VisibleProcessRow } from './types';

const getFlatProcessRows = (rows: ProcessRowDto[]): VisibleProcessDataRow[] => rows.map((row) => ({ depth: 0, kind: 'process', row }));

const assertNever = (value: never): never => {
  throw new Error(`Unhandled process table view mode: ${String(value)}`);
};

export function getVisibleProcessRows(rows: ProcessRowDto[], viewMode: 'flat' | 'parentGrouped'): VisibleProcessDataRow[];
export function getVisibleProcessRows(rows: ProcessRowDto[], viewMode: 'userGrouped'): VisibleProcessRow[];
export function getVisibleProcessRows(rows: ProcessRowDto[], viewMode: ProcessTableViewMode): VisibleProcessRow[];
export function getVisibleProcessRows(rows: ProcessRowDto[], viewMode: ProcessTableViewMode): VisibleProcessRow[] {
  switch (viewMode) {
    case 'flat':
      return getFlatProcessRows(rows);
    case 'parentGrouped':
      return getParentGroupedProcessRows(rows);
    case 'userGrouped':
      return getUserGroupedProcessRows(rows);
    default:
      return assertNever(viewMode);
  }
}
