import { describe, expect, it } from 'vitest';

import type { ServerOverviewDto } from '../../lib/types';
import { isOverviewStatusOnline, overviewNeedsAttention, summarizeOverviewFleet } from './overviewModel';

const baseOverviewRow: ServerOverviewDto = {
  id: 'server-base',
  name: 'Base GPU Server',
  host: 'base.local',
  status: 'online',
  gpuTotal: 1,
  busyGpuCount: 0,
  freeGpuCount: 1,
  averageGpuUtilizationPercent: 12.5,
  averageMemoryUsagePercent: 20,
  maxTemperatureCelsius: 55,
  lastSuccessAt: '2026-06-01T00:00:00Z',
  lastErrorType: null,
  lastErrorMessage: null
};

const buildOverviewRow = (overrides: Partial<ServerOverviewDto>): ServerOverviewDto => ({
  ...baseOverviewRow,
  ...overrides
});

describe('overviewModel fleet summary helpers', () => {
  it('detects online status only for exact case-insensitive online', () => {
    expect(isOverviewStatusOnline('online')).toBe(true);
    expect(isOverviewStatusOnline('ONLINE')).toBe(true);
    expect(isOverviewStatusOnline('Online')).toBe(true);

    expect(isOverviewStatusOnline('online-stale')).toBe(false);
    expect(isOverviewStatusOnline('nearly-online')).toBe(false);
    expect(isOverviewStatusOnline('offline')).toBe(false);
    expect(isOverviewStatusOnline('unknown')).toBe(false);
  });

  it('flags statuses and error metadata that need attention', () => {
    const staleRow = buildOverviewRow({ id: 'server-stale', status: 'online-stale' });
    const errorRow = buildOverviewRow({ id: 'server-error', status: 'error' });
    const failedRow = buildOverviewRow({ id: 'server-failed', status: 'refresh-failed' });
    const degradedRow = buildOverviewRow({ id: 'server-degraded', status: 'degraded' });
    const typedErrorRow = buildOverviewRow({ id: 'server-error-type', lastErrorType: 'ssh_timeout' });
    const messageErrorRow = buildOverviewRow({ id: 'server-error-message', lastErrorMessage: 'SSH connection timed out' });

    expect(overviewNeedsAttention(staleRow)).toBe(true);
    expect(overviewNeedsAttention(errorRow)).toBe(true);
    expect(overviewNeedsAttention(failedRow)).toBe(true);
    expect(overviewNeedsAttention(degradedRow)).toBe(true);
    expect(overviewNeedsAttention(typedErrorRow)).toBe(true);
    expect(overviewNeedsAttention(messageErrorRow)).toBe(true);
  });

  it('keeps baseline non-error statuses out of attention', () => {
    expect(overviewNeedsAttention(buildOverviewRow({ id: 'server-online', status: 'online' }))).toBe(false);
    expect(overviewNeedsAttention(buildOverviewRow({ id: 'server-offline', status: 'offline' }))).toBe(false);
    expect(overviewNeedsAttention(buildOverviewRow({ id: 'server-disabled', status: 'disabled' }))).toBe(false);
    expect(overviewNeedsAttention(buildOverviewRow({ id: 'server-unknown', status: 'unknown' }))).toBe(false);
  });

  it('summarizes an empty fleet with zero totals', () => {
    expect(summarizeOverviewFleet([])).toEqual({
      attentionServers: 0,
      busyGpus: 0,
      freeGpus: 0,
      onlineServers: 0,
      totalGpus: 0,
      totalServers: 0
    });
  });

  it('summarizes mixed fleet totals exactly', () => {
    const rows: ServerOverviewDto[] = [
      buildOverviewRow({ id: 'server-online', status: 'ONLINE', gpuTotal: 4, busyGpuCount: 3, freeGpuCount: 1 }),
      buildOverviewRow({ id: 'server-stale', status: 'online-stale', gpuTotal: 2, busyGpuCount: 1, freeGpuCount: 1 }),
      buildOverviewRow({ id: 'server-error', status: 'offline', gpuTotal: 8, busyGpuCount: 6, freeGpuCount: 2, lastErrorType: 'auth_failed' })
    ];

    expect(summarizeOverviewFleet(rows)).toEqual({
      attentionServers: 2,
      busyGpus: 10,
      freeGpus: 4,
      onlineServers: 1,
      totalGpus: 14,
      totalServers: 3
    });
  });

  it('preserves zero GPU counts and ignores nullable average metrics', () => {
    const rows: ServerOverviewDto[] = [
      buildOverviewRow({
        id: 'server-zero-gpus',
        gpuTotal: 0,
        busyGpuCount: 0,
        freeGpuCount: 0,
        averageGpuUtilizationPercent: null,
        averageMemoryUsagePercent: null,
        maxTemperatureCelsius: null
      })
    ];

    expect(summarizeOverviewFleet(rows)).toEqual({
      attentionServers: 0,
      busyGpus: 0,
      freeGpus: 0,
      onlineServers: 1,
      totalGpus: 0,
      totalServers: 1
    });
  });
});
