import { formatCommand } from '../format';
import type { ProcessRowDto } from '../types';
import { includesText, normalizeSearchText } from './shared';
import type { ProcessTableFilters } from './types';

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
