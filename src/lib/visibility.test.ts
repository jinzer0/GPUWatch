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
import type { GpuCardDto, ProcessRowDto, ServerOverviewDto } from './types';

const gpuCardFixture: GpuCardDto = {
  index: 0,
  uuid: 'GPU-1111',
  name: 'NVIDIA RTX 6000',
  pciBusId: '0000:17:00.0',
  driverVersion: '550.54',
  graphicsClockMhz: 1740,
  memoryClockMhz: 9501,
  busy: false,
  memoryTotalMiB: 24576,
  memoryUsedMiB: 0,
  memoryFreeMiB: 24576,
  gpuUtilizationPercent: 0,
  memoryUtilizationPercent: 0,
  temperatureCelsius: 32,
  powerDrawWatt: 42.5,
  powerLimitWatt: 300,
  fanSpeedPercent: 18,
  processCount: 0,
  processes: []
};

const processRows: ProcessRowDto[] = [
  {
    serverId: 'alpha',
    serverName: 'Alpha Node',
    stale: false,
    gpuIndex: 1,
    pid: 100,
    username: 'alice',
    command: 'python train.py --token=supersecret --output /Users/alice/projects/checkpoint.bin',
    gpuUuid: 'GPU-alpha-1',
    processKind: 'compute',
    gpuMemoryUsedMiB: 2048,
    gpuUtilizationPercent: 90,
    cpuPercent: 12,
    hostMemoryUsedMiB: 1024
  },
  {
    serverId: 'alpha-clone',
    serverName: 'Alpha Node',
    stale: false,
    gpuIndex: 1,
    pid: 100,
    username: 'alice',
    command: 'python train.py --token=supersecret --output /Users/alice/projects/checkpoint.bin',
    gpuUuid: 'GPU-alpha-1',
    processKind: 'compute',
    gpuMemoryUsedMiB: 2048,
    gpuUtilizationPercent: 90,
    cpuPercent: 12,
    hostMemoryUsedMiB: 1024
  },
  {
    serverId: 'beta',
    serverName: 'Beta Node',
    stale: true,
    gpuIndex: 0,
    pid: 200,
    username: null,
    command: `python render.py ${'x'.repeat(120)} hidden-tail-marker`,
    gpuUuid: 'GPU-beta-0',
    processKind: 'graphics',
    gpuMemoryUsedMiB: 2048,
    gpuUtilizationPercent: null,
    cpuPercent: null,
    hostMemoryUsedMiB: null
  },
  {
    serverId: 'gamma',
    serverName: 'Gamma Node',
    stale: false,
    gpuIndex: 2,
    pid: 300,
    username: 'carol',
    command: null,
    gpuUuid: 'GPU-gamma-2',
    processKind: 'unknown',
    gpuMemoryUsedMiB: 512,
    gpuUtilizationPercent: 10,
    cpuPercent: 1,
    hostMemoryUsedMiB: 256
  },
  {
    serverId: 'delta',
    serverName: 'Delta Node',
    stale: false,
    gpuIndex: 3,
    pid: 400,
    username: 'dave',
    command: 'python final.py',
    gpuUuid: 'GPU-delta-3',
    processKind: 'compute',
    gpuMemoryUsedMiB: null,
    gpuUtilizationPercent: 0,
    cpuPercent: 0,
    hostMemoryUsedMiB: 0
  }
];

const overviewRows: ServerOverviewDto[] = [
  {
    id: 'alpha',
    name: 'Alpha Node',
    host: 'alpha.local',
    status: 'online',
    gpuTotal: 4,
    busyGpuCount: 2,
    freeGpuCount: 2,
    averageGpuUtilizationPercent: 32.5,
    averageMemoryUsagePercent: 44.1,
    maxTemperatureCelsius: 68,
    lastSuccessAt: '2026-06-01T00:00:00Z',
    lastErrorType: null,
    lastErrorMessage: null
  },
  {
    id: 'beta',
    name: 'Beta Node',
    host: 'beta.local',
    status: 'stale',
    gpuTotal: 2,
    busyGpuCount: 1,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: null,
    averageMemoryUsagePercent: null,
    maxTemperatureCelsius: null,
    lastSuccessAt: '2026-06-01T01:00:00Z',
    lastErrorType: 'ssh_timeout',
    lastErrorMessage: 'SSH connection timed out'
  },
  {
    id: 'gamma',
    name: 'Gamma Node',
    host: 'gamma.local',
    status: 'error',
    gpuTotal: 1,
    busyGpuCount: 0,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: null,
    averageMemoryUsagePercent: null,
    maxTemperatureCelsius: null,
    lastSuccessAt: null,
    lastErrorType: 'auth_failed',
    lastErrorMessage: 'Permission denied for /Users/alice/.ssh/id_ed25519'
  }
];

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
    const parentRows: ProcessRowDto[] = [
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 20,
        username: 'alice',
        command: 'python parent.py',
        gpuUuid: 'GPU-alpha-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 10,
        gpuUtilizationPercent: 10,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 30,
        parentPid: 20,
        username: 'alice',
        command: 'python child.py',
        gpuUuid: 'GPU-alpha-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 99,
        gpuUtilizationPercent: 99,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      }
    ];

    expect(getVisibleProcessRows(parentRows, 'flat').map((item) => ({ pid: item.row.pid, depth: item.depth }))).toEqual([
      { pid: 20, depth: 0 },
      { pid: 30, depth: 0 }
    ]);
  });

  it('groups visible GPU child process rows under visible GPU parents without inventing missing parents', () => {
    const parentRows: ProcessRowDto[] = [
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 30,
        parentPid: 20,
        username: 'alice',
        command: 'python child-high.py',
        gpuUuid: 'GPU-alpha-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 99,
        gpuUtilizationPercent: 99,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'beta',
        serverName: 'Beta Node',
        stale: false,
        gpuIndex: 0,
        pid: 70,
        parentPid: 20,
        username: 'bob',
        command: 'python orphan.py',
        gpuUuid: 'GPU-beta-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 80,
        gpuUtilizationPercent: 80,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 20,
        username: 'alice',
        command: 'python parent.py',
        gpuUuid: 'GPU-alpha-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 10,
        gpuUtilizationPercent: 10,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 25,
        parentPid: 20,
        username: 'alice',
        command: 'python child-low.py',
        gpuUuid: 'GPU-alpha-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 5,
        gpuUtilizationPercent: 5,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      }
    ];

    expect(getVisibleProcessRows(parentRows, 'parentGrouped').map((item) => ({ pid: item.row.pid, depth: item.depth }))).toEqual([
      { pid: 70, depth: 0 },
      { pid: 20, depth: 0 },
      { pid: 25, depth: 1 },
      { pid: 30, depth: 1 }
    ]);
  });

  it('prefers same-GPU parent rows when duplicate PIDs are visible on one server', () => {
    const duplicatePidRows: ProcessRowDto[] = [
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 20,
        username: 'alice',
        command: 'python parent-gpu0.py',
        gpuUuid: 'GPU-alpha-0',
        processKind: 'compute',
        gpuMemoryUsedMiB: 10,
        gpuUtilizationPercent: 10,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 1,
        pid: 20,
        username: 'alice',
        command: 'python parent-gpu1.py',
        gpuUuid: 'GPU-alpha-1',
        processKind: 'compute',
        gpuMemoryUsedMiB: 9,
        gpuUtilizationPercent: 9,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'alpha',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 1,
        pid: 30,
        parentPid: 20,
        username: 'alice',
        command: 'python child.py',
        gpuUuid: 'GPU-alpha-1',
        processKind: 'compute',
        gpuMemoryUsedMiB: 8,
        gpuUtilizationPercent: 8,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      }
    ];

    expect(getVisibleProcessRows(duplicatePidRows, 'parentGrouped').map((item) => `${item.depth}:${item.row.gpuUuid}:${item.row.pid}`)).toEqual([
      '0:GPU-alpha-0:20',
      '0:GPU-alpha-1:20',
      '1:GPU-alpha-1:30'
    ]);
  });

  it('keeps null command rows last for command sorting in ascending order', () => {
    const commandRows: ProcessRowDto[] = [
      {
        serverId: 'null-command',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 10,
        username: 'alice',
        command: null,
        gpuUuid: 'GPU-null-command',
        processKind: 'compute',
        gpuMemoryUsedMiB: 1,
        gpuUtilizationPercent: 1,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'zzz-command',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 11,
        username: 'alice',
        command: 'zzz --token=supersecret',
        gpuUuid: 'GPU-zzz-command',
        processKind: 'compute',
        gpuMemoryUsedMiB: 1,
        gpuUtilizationPercent: 1,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'aaa-command',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 12,
        username: 'alice',
        command: 'aaa --password=supersecret',
        gpuUuid: 'GPU-aaa-command',
        processKind: 'compute',
        gpuMemoryUsedMiB: 1,
        gpuUtilizationPercent: 1,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      }
    ];

    expect(sortProcessRows(commandRows, { key: 'command', direction: 'asc' })).toEqual([
      commandRows[2],
      commandRows[1],
      commandRows[0]
    ]);
  });

  it('keeps null command rows last for command sorting in descending order', () => {
    const commandRows: ProcessRowDto[] = [
      {
        serverId: 'null-command',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 10,
        username: 'alice',
        command: null,
        gpuUuid: 'GPU-null-command',
        processKind: 'compute',
        gpuMemoryUsedMiB: 1,
        gpuUtilizationPercent: 1,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'zzz-command',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 11,
        username: 'alice',
        command: 'zzz --token=supersecret',
        gpuUuid: 'GPU-zzz-command',
        processKind: 'compute',
        gpuMemoryUsedMiB: 1,
        gpuUtilizationPercent: 1,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      },
      {
        serverId: 'aaa-command',
        serverName: 'Alpha Node',
        stale: false,
        gpuIndex: 0,
        pid: 12,
        username: 'alice',
        command: 'aaa --password=supersecret',
        gpuUuid: 'GPU-aaa-command',
        processKind: 'compute',
        gpuMemoryUsedMiB: 1,
        gpuUtilizationPercent: 1,
        cpuPercent: 1,
        hostMemoryUsedMiB: 1
      }
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
