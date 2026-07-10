import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OVERVIEW_FILTERS,
  DEFAULT_PROCESS_TABLE_FILTERS,
  DEFAULT_PROCESS_TABLE_SORT,
  filterOverviewRows,
  filterProcessRows,
  getVisibleProcessRows,
  sortOverviewRows,
  sortProcessRows,
  type OverviewSortKey,
  type ProcessTableSortKey
} from './visibility';
import { gpuCardFixture, makeProcessRow, visibilityProcessRows as processRows } from '../test-utils/process-fixtures';
import { overviewRows } from '../test-utils/server-fixtures';

describe('visibility helpers', () => {
  it('keeps DTO additions available for visibility utilities', () => {
    expect(gpuCardFixture.pciBusId).toBe('0000:17:00.0');
    expect(gpuCardFixture.driverVersion).toBe('550.54');
    expect(gpuCardFixture.graphicsClockMhz).toBe(1740);
    expect(gpuCardFixture.memoryClockMhz).toBe(9501);
    expect(processRows[0].gpuUuid).toBe('GPU-alpha-1');
    expect(processRows[0].processKind).toBe('compute');
  });

  it('filters process rows by screen-local state and sanitized command text', () => {
    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        searchText: 'alpha',
        serverName: 'Alpha Node'
      })
    ).toHaveLength(2);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        searchText: 'gpu-beta-0'
      })
    ).toHaveLength(1);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        searchText: 'compute'
      })
    ).toHaveLength(3);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        searchText: '[redacted]'
      })
    ).toHaveLength(2);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        searchText: 'supersecret'
      })
    ).toHaveLength(0);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        searchText: 'hidden-tail-marker'
      })
    ).toHaveLength(0);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        stale: 'stale'
      })
    ).toEqual([processRows[2]]);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        stale: 'current',
        processKind: 'compute'
      })
    ).toEqual([processRows[0], processRows[1], processRows[4]]);

    expect(
      filterProcessRows(processRows, {
        ...DEFAULT_PROCESS_TABLE_FILTERS,
        gpuIndex: 2
      })
    ).toEqual([processRows[3]]);
  });

  it('filters overview rows by text, status, and stale/error semantics', () => {
    expect(
      filterOverviewRows(overviewRows, {
        ...DEFAULT_OVERVIEW_FILTERS,
        searchText: 'alpha.local'
      })
    ).toEqual([overviewRows[0]]);

    expect(
      filterOverviewRows(overviewRows, {
        ...DEFAULT_OVERVIEW_FILTERS,
        searchText: 'ssh_timeout'
      })
    ).toEqual([overviewRows[1]]);

    expect(
      filterOverviewRows(overviewRows, {
        ...DEFAULT_OVERVIEW_FILTERS,
        searchText: 'permission denied'
      })
    ).toEqual([overviewRows[2]]);

    expect(
      filterOverviewRows(overviewRows, {
        ...DEFAULT_OVERVIEW_FILTERS,
        status: 'online'
      })
    ).toEqual([overviewRows[0]]);

    expect(
      filterOverviewRows(overviewRows, {
        ...DEFAULT_OVERVIEW_FILTERS,
        state: 'stale'
      })
    ).toEqual([overviewRows[1]]);

    expect(
      filterOverviewRows(overviewRows, {
        ...DEFAULT_OVERVIEW_FILTERS,
        state: 'error'
      })
    ).toEqual([overviewRows[1], overviewRows[2]]);
  });

  it('sorts process rows with nulls last and deterministic tie-breakers', () => {
    const descRows = sortProcessRows(processRows, DEFAULT_PROCESS_TABLE_SORT);

    expect(descRows).toEqual([processRows[0], processRows[1], processRows[2], processRows[3], processRows[4]]);

    const ascRows = sortProcessRows(processRows, { key: 'gpuMemoryUsedMiB', direction: 'asc' });

    expect(ascRows).toEqual([processRows[3], processRows[0], processRows[1], processRows[2], processRows[4]]);
    expect(descRows[0]).toBe(processRows[0]);
    expect(descRows[1]).toBe(processRows[1]);
  });

  it('keeps process rows flat by default after existing sort order', () => {
    const parentRows = [
      makeProcessRow({ pid: 20, command: 'python parent.py', gpuMemoryUsedMiB: 10, gpuUtilizationPercent: 10 }),
      makeProcessRow({ pid: 30, parentPid: 20, command: 'python child.py', gpuMemoryUsedMiB: 99, gpuUtilizationPercent: 99 })
    ];

    expect(getVisibleProcessRows(parentRows, 'flat').map((item) => ({ pid: item.row.pid, depth: item.depth }))).toEqual([
      { pid: 20, depth: 0 },
      { pid: 30, depth: 0 }
    ]);
  });

  it('groups visible GPU child process rows under visible GPU parents without inventing missing parents', () => {
    const parentRows = [
      makeProcessRow({ pid: 30, parentPid: 20, command: 'python child-high.py', gpuMemoryUsedMiB: 99, gpuUtilizationPercent: 99 }),
      makeProcessRow({
        serverId: 'beta',
        serverName: 'Beta Node',
        pid: 70,
        parentPid: 20,
        username: 'bob',
        command: 'python orphan.py',
        gpuUuid: 'GPU-beta-0',
        gpuMemoryUsedMiB: 80,
        gpuUtilizationPercent: 80
      }),
      makeProcessRow({ pid: 20, command: 'python parent.py', gpuMemoryUsedMiB: 10, gpuUtilizationPercent: 10 }),
      makeProcessRow({ pid: 25, parentPid: 20, command: 'python child-low.py', gpuMemoryUsedMiB: 5, gpuUtilizationPercent: 5 })
    ];

    expect(getVisibleProcessRows(parentRows, 'parentGrouped').map((item) => ({ pid: item.row.pid, depth: item.depth }))).toEqual([
      { pid: 70, depth: 0 },
      { pid: 20, depth: 0 },
      { pid: 25, depth: 1 },
      { pid: 30, depth: 1 }
    ]);
  });

  it('prefers same-GPU parent rows when duplicate PIDs are visible on one server', () => {
    const duplicatePidRows = [
      makeProcessRow({ pid: 20, command: 'python parent-gpu0.py', gpuUuid: 'GPU-alpha-0', gpuMemoryUsedMiB: 10, gpuUtilizationPercent: 10 }),
      makeProcessRow({ gpuIndex: 1, pid: 20, command: 'python parent-gpu1.py', gpuUuid: 'GPU-alpha-1', gpuMemoryUsedMiB: 9, gpuUtilizationPercent: 9 }),
      makeProcessRow({ gpuIndex: 1, pid: 30, parentPid: 20, command: 'python child.py', gpuUuid: 'GPU-alpha-1', gpuMemoryUsedMiB: 8, gpuUtilizationPercent: 8 })
    ];

    expect(getVisibleProcessRows(duplicatePidRows, 'parentGrouped').map((item) => `${item.depth}:${item.row.gpuUuid}:${item.row.pid}`)).toEqual([
      '0:GPU-alpha-0:20',
      '0:GPU-alpha-1:20',
      '1:GPU-alpha-1:30'
    ]);
  });

  it('groups sorted process rows by server and normalized user label while preserving row order within each user group', () => {
    const userRows = [
      makeProcessRow({ serverId: 'beta', serverName: 'Beta Node', pid: 30, username: '', command: 'python beta-unknown.py', gpuUuid: 'GPU-beta-0', gpuMemoryUsedMiB: 30, gpuUtilizationPercent: 30 }),
      makeProcessRow({ pid: 50, username: 'alice', command: 'python alpha-alice-high.py', gpuMemoryUsedMiB: 50, gpuUtilizationPercent: 50 }),
      makeProcessRow({ gpuIndex: 1, pid: 20, username: null, command: 'python alpha-unknown.py', gpuUuid: 'GPU-alpha-1', gpuMemoryUsedMiB: 20, gpuUtilizationPercent: 20 }),
      makeProcessRow({ gpuIndex: 2, pid: 10, username: 'alice', command: 'python alpha-alice-low.py', gpuUuid: 'GPU-alpha-2', gpuMemoryUsedMiB: 10, gpuUtilizationPercent: 10 })
    ];

    expect(
      getVisibleProcessRows(userRows, 'userGrouped').map((item) =>
        item.kind === 'section' ? `${item.kind}:${item.label}` : `${item.kind}:${item.depth}:${item.row.serverName}:${item.row.username || 'unknown'}:${item.row.pid}`
      )
    ).toEqual([
      'section:Alpha Node / alice',
      'process:1:Alpha Node:alice:50',
      'process:1:Alpha Node:alice:10',
      'section:Alpha Node / unknown user',
      'process:1:Alpha Node:unknown:20',
      'section:Beta Node / unknown user',
      'process:1:Beta Node:unknown:30'
    ]);
  });

  it('keeps null command rows last for command sorting in ascending order', () => {
    const commandRows = [
      makeProcessRow({ serverId: 'null-command', pid: 10, command: null, gpuUuid: 'GPU-null-command', gpuMemoryUsedMiB: 1, gpuUtilizationPercent: 1 }),
      makeProcessRow({ serverId: 'zzz-command', pid: 11, command: 'zzz --token=supersecret', gpuUuid: 'GPU-zzz-command', gpuMemoryUsedMiB: 1, gpuUtilizationPercent: 1 }),
      makeProcessRow({ serverId: 'aaa-command', pid: 12, command: 'aaa --password=supersecret', gpuUuid: 'GPU-aaa-command', gpuMemoryUsedMiB: 1, gpuUtilizationPercent: 1 })
    ];

    expect(sortProcessRows(commandRows, { key: 'command', direction: 'asc' })).toEqual([
      commandRows[2],
      commandRows[1],
      commandRows[0]
    ]);
  });

  it('keeps null command rows last for command sorting in descending order', () => {
    const commandRows = [
      makeProcessRow({ serverId: 'null-command', pid: 10, command: null, gpuUuid: 'GPU-null-command', gpuMemoryUsedMiB: 1, gpuUtilizationPercent: 1 }),
      makeProcessRow({ serverId: 'zzz-command', pid: 11, command: 'zzz --token=supersecret', gpuUuid: 'GPU-zzz-command', gpuMemoryUsedMiB: 1, gpuUtilizationPercent: 1 }),
      makeProcessRow({ serverId: 'aaa-command', pid: 12, command: 'aaa --password=supersecret', gpuUuid: 'GPU-aaa-command', gpuMemoryUsedMiB: 1, gpuUtilizationPercent: 1 })
    ];

    expect(sortProcessRows(commandRows, { key: 'command', direction: 'desc' })).toEqual([
      commandRows[1],
      commandRows[2],
      commandRows[0]
    ]);
  });

  it('sorts overview rows with nulls last and stable tie handling', () => {
    const sorted = sortOverviewRows(overviewRows, { key: 'lastSuccessAt', direction: 'asc' } satisfies { key: OverviewSortKey; direction: 'asc' });

    expect(sorted).toEqual([overviewRows[0], overviewRows[1], overviewRows[2]]);
  });
});
