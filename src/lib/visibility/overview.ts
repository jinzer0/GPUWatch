import { sanitizeMessage } from '../format';
import type { ServerOverviewDto } from '../types';
import { compareNullableStrings, includesText, normalizeSearchText, stableSort } from './shared';
import type { OverviewFilters, OverviewSortKey, SortSpec } from './types';

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

export const sortOverviewRows = (rows: ServerOverviewDto[], sort: SortSpec<OverviewSortKey>) => stableSort(rows, (left, right) => compareOverviewRows(left, right, sort));
