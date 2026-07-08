import type { SortDirection } from './types';

export const normalizeSearchText = (value: string) => value.trim().toLowerCase();

export const includesText = (value: string | number | null | undefined, searchText: string) => {
  if (!searchText) {
    return true;
  }
  return String(value ?? '').toLowerCase().includes(searchText);
};

export const compareNullableStrings = (left: string | null | undefined, right: string | null | undefined, direction: SortDirection) => {
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

export const compareNullableNumbers = (left: number | null | undefined, right: number | null | undefined, direction: SortDirection) => {
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

export const stableSort = <T>(rows: readonly T[], compare: (left: T, right: T) => number) =>
  rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => compare(left.row, right.row) || left.index - right.index)
    .map(({ row }) => row);
