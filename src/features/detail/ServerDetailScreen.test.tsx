import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ServerDetailScreen } from './ServerDetailScreen';
import type { ServerDetailDto } from '../../lib/types';

const detailFixture: ServerDetailDto = {
  server: {
    id: 'server-1',
    name: 'Lab GPU',
    host: 'gpu.example.test',
    port: 22,
    username: 'alice',
    sshKeyPath: null,
    pollingIntervalSeconds: 30,
    enabled: true,
    configRevision: 1,
    createdAt: '2026-06-02T00:00:00Z',
    updatedAt: '2026-06-02T00:00:00Z'
  },
  health: {
    status: 'online',
    lastErrorType: null,
    lastErrorMessage: null,
    lastPollStartedAt: null,
    lastPollFinishedAt: null,
    lastSuccessAt: null
  },
  collectorHostname: null,
  driverVersion: null,
  cudaVersion: null,
  receivedAt: null,
  warnings: ['pmon unavailable; per-process utilization unknown'],
  gpus: [
    {
      index: 0,
      uuid: 'GPU-nullable',
      name: 'NVIDIA Test GPU',
      busy: false,
      memoryTotalMiB: null,
      memoryUsedMiB: null,
      memoryFreeMiB: null,
      gpuUtilizationPercent: null,
      memoryUtilizationPercent: null,
      temperatureCelsius: null,
      powerDrawWatt: null,
      powerLimitWatt: null,
      fanSpeedPercent: null,
      processCount: 1,
      processes: [
        {
          pid: 1234,
          username: null,
          command: null,
          gpuMemoryUsedMiB: null,
          gpuUtilizationPercent: null,
          cpuPercent: null,
          hostMemoryUsedMiB: null
        }
      ]
    }
  ]
};

vi.mock('../../lib/api', () => ({
  getServerDetail: vi.fn(() => Promise.resolve(detailFixture)),
  queryKeys: {
    detail: (id: string) => ['server-detail', id],
    overview: ['overview'],
    processes: ['processes']
  },
  refreshServer: vi.fn()
}));

describe('ServerDetailScreen', () => {
  it('keeps warnings visible and renders nullable metrics as unknown', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ServerDetailScreen selectedServerId="server-1" />
      </QueryClientProvider>
    );

    expect(await screen.findByText('pmon unavailable; per-process utilization unknown')).toBeDefined();
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByText('0.0%')).toBeNull();
    expect(screen.queryByText('0 MiB')).toBeNull();
  });
});
