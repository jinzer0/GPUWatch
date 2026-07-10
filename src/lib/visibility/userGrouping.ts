import type { ProcessRowDto } from '../types';
import type { VisibleProcessRow } from './types';

type UserGroup = {
  readonly key: string;
  readonly rows: ProcessRowDto[];
  readonly serverId: string;
  readonly serverName: string;
  readonly usernameLabel: string;
};

const normalizeUsernameGroupLabel = (username: string | null) => {
  const normalized = username?.trim() ?? '';
  return normalized.length > 0 ? normalized : 'unknown user';
};

export const getUserGroupedProcessRows = (rows: ProcessRowDto[]): VisibleProcessRow[] => {
  const groupsByKey = new Map<string, UserGroup>();

  rows.forEach((row) => {
    const usernameLabel = normalizeUsernameGroupLabel(row.username);
    const key = `${row.serverId}::${row.serverName}::${usernameLabel.toLowerCase()}`;
    const group = groupsByKey.get(key);
    if (group) {
      group.rows.push(row);
      return;
    }
    groupsByKey.set(key, { key, rows: [row], serverId: row.serverId, serverName: row.serverName, usernameLabel });
  });

  const groups = Array.from(groupsByKey.values()).sort(
    (left, right) =>
      left.serverName.localeCompare(right.serverName) || left.serverId.localeCompare(right.serverId) || left.usernameLabel.localeCompare(right.usernameLabel)
  );

  return groups.flatMap((group) => [
    {
      kind: 'section' as const,
      key: group.key,
      label: `${group.serverName} / ${group.usernameLabel}`,
      processCount: group.rows.length,
      serverName: group.serverName,
      usernameLabel: group.usernameLabel
    },
    ...group.rows.map((row) => ({ depth: 1, kind: 'process' as const, row }))
  ]);
};
