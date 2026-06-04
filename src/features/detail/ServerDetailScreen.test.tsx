import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerDetailScreen } from './ServerDetailScreen';
import { getServerDetail, listGpuHistory } from '../../lib/api';
import { getLiveGpuSampleKey } from '../../lib/liveHistory';
import { useUiStore } from '../../lib/store';
import type { GpuHistoryResponseDto, GpuHistorySampleDto, ServerDetailDto } from '../../lib/types';

const apiMocks = vi.hoisted(() => ({
  getServerDetail: vi.fn(),
  listGpuHistory: vi.fn(),
  refreshServer: vi.fn()
}));

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
      pciBusId: null,
      driverVersion: null,
      graphicsClockMhz: null,
      memoryClockMhz: null,
      busy: false,
      memoryTotalMiB: null,
      memoryUsedMiB: null,
      memoryFreeMiB: null,
      gpuUtilizationPercent: null,
      memoryUtilizationPercent: null,
      encoderUtilizationPercent: null,
      decoderUtilizationPercent: null,
      jpegUtilizationPercent: null,
      ofaUtilizationPercent: null,
      pcieRxKibPerSec: null,
      pcieTxKibPerSec: null,
      pcieLinkGenCurrent: null,
      pcieLinkWidthCurrent: null,
      migModeCurrent: null,
      migModePending: null,
      migInstanceCount: null,
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
    },
    {
      index: 1,
      uuid: 'GPU-populated',
      name: 'NVIDIA Clocked GPU',
      pciBusId: '00000000:65:00.0',
      driverVersion: '550.54.14',
      graphicsClockMhz: 1410,
      memoryClockMhz: 5001,
      busy: true,
      memoryTotalMiB: 49152,
      memoryUsedMiB: 32768,
      memoryFreeMiB: 16384,
      gpuUtilizationPercent: 83.2,
      memoryUtilizationPercent: 67.4,
      encoderUtilizationPercent: 12.3,
      decoderUtilizationPercent: 4.5,
      jpegUtilizationPercent: 6.7,
      ofaUtilizationPercent: 8.9,
      pcieRxKibPerSec: 1536,
      pcieTxKibPerSec: 2048,
      pcieLinkGenCurrent: 4,
      pcieLinkWidthCurrent: 16,
      migModeCurrent: 'Enabled',
      migModePending: 'Disabled',
      migInstanceCount: 2,
      temperatureCelsius: 71.5,
      powerDrawWatt: 225.3,
      powerLimitWatt: 300,
      fanSpeedPercent: 46.2,
      processCount: 0,
      processes: []
    }
  ]
};

vi.mock('../../lib/api', () => ({
  getServerDetail: apiMocks.getServerDetail,
  listGpuHistory: apiMocks.listGpuHistory,
  queryKeys: {
    detail: (id: string) => ['server-detail', id],
    gpuHistory: (serverId: string | null | undefined, gpuIndex: number | null | undefined, gpuUuid: string | null | undefined, range: string) => [
      'gpu-history',
      serverId ?? null,
      gpuIndex ?? null,
      gpuUuid ?? null,
      range
    ],
    overview: ['overview'],
    processes: ['processes']
  },
  refreshServer: apiMocks.refreshServer
}));

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const historySample = (overrides: Partial<GpuHistorySampleDto> = {}): GpuHistorySampleDto => ({
  receivedAt: '2026-06-04T00:00:00.000Z',
  memoryTotalMiB: 49_152,
  memoryUsedMiB: 12_288,
  memoryFreeMiB: 36_864,
  gpuUtilizationPercent: 30,
  memoryUtilizationPercent: 25,
  encoderUtilizationPercent: 5,
  decoderUtilizationPercent: 4,
  jpegUtilizationPercent: null,
  ofaUtilizationPercent: null,
  temperatureCelsius: 50,
  powerDrawWatt: 150,
  powerLimitWatt: 300,
  pcieRxKibPerSec: 512,
  pcieTxKibPerSec: 768,
  ...overrides
});

const historyResponse = (series: GpuHistoryResponseDto['series'] = []): GpuHistoryResponseDto => ({
  serverId: 'server-1',
  serverName: 'Lab GPU',
  pollingIntervalSeconds: 30,
  range: '1h',
  startedAt: '2026-06-04T00:00:00.000Z',
  finishedAt: '2026-06-04T01:00:00.000Z',
  series
});

const sessionSample = (overrides: Partial<NonNullable<ReturnType<typeof useUiStore.getState>['liveSamples'][string]>[number]> = {}) => ({
  serverId: 'server-1',
  gpuIndex: 1,
  gpuUuid: 'GPU-populated',
  receivedAt: '2026-06-04T00:00:00.000Z',
  memoryUsedMiB: 24_576,
  memoryFreeMiB: 24_576,
  memoryTotalMiB: 49_152,
  gpuUtilizationPercent: 40,
  memoryUtilizationPercent: 50,
  encoderUtilizationPercent: 10,
  decoderUtilizationPercent: 3,
  jpegUtilizationPercent: null,
  ofaUtilizationPercent: null,
  pcieRxKibPerSec: 1000,
  pcieTxKibPerSec: null,
  temperatureCelsius: null,
  powerDrawWatt: null,
  powerLimitWatt: null,
  stale: false,
  source: 'live' as const,
  ...overrides
});

type QueryWithRefetchInterval = {
  options: {
    refetchInterval?: (query: unknown) => number | false;
  };
};

const renderDetail = (detail: ServerDetailDto = detailFixture, historyResult: GpuHistoryResponseDto | Promise<GpuHistoryResponseDto> = historyResponse()) => {
  vi.mocked(getServerDetail).mockResolvedValue(detail);
  vi.mocked(listGpuHistory).mockReturnValue(Promise.resolve(historyResult));
  const queryClient = makeQueryClient();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <ServerDetailScreen selectedServerId={detail.server.id} />
    </QueryClientProvider>
  );

  return { queryClient, ...view };
};

describe('ServerDetailScreen', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps warnings visible and renders nullable metrics as unknown', async () => {
    renderDetail();

    expect(await screen.findByText('pmon unavailable; per-process utilization unknown')).toBeDefined();
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByText('0.0%')).toBeNull();
    expect(screen.queryByText('0 MiB')).toBeNull();
    expect(screen.queryByText('0 MHz')).toBeNull();
  });

  it('renders per-GPU identity and clocks without falling back to server driver metadata', async () => {
    renderDetail();

    expect(await screen.findAllByText('PCI bus id')).toHaveLength(2);
    expect(screen.getAllByText('Per-GPU driver')).toHaveLength(2);
    expect(screen.getAllByText('Graphics clock')).toHaveLength(2);
    expect(screen.getAllByText('Memory clock')).toHaveLength(2);
    expect(screen.getByText('00000000:65:00.0')).toBeDefined();
    expect(screen.getByText('550.54.14')).toBeDefined();
    expect(screen.getByText('1,410 MHz')).toBeDefined();
    expect(screen.getByText('5,001 MHz')).toBeDefined();
  });

  it('enables detail refetching at the selected server interval with a five second minimum', async () => {
    const { queryClient } = renderDetail({ ...detailFixture, server: { ...detailFixture.server, pollingIntervalSeconds: 2 } });

    const query = queryClient.getQueryCache().find({ queryKey: ['server-detail', 'server-1'] }) as QueryWithRefetchInterval | undefined;
    expect(query).toBeDefined();
    expect(typeof query?.options.refetchInterval).toBe('function');
    expect(query?.options.refetchInterval?.(query)).toBe(10_000);

    expect(await screen.findByText('Lab GPU')).toBeDefined();
    expect(query?.options.refetchInterval?.(query)).toBe(5_000);
  });

  it('appends live history once for each new successful detail receivedAt', async () => {
    const first = { ...detailFixture, receivedAt: '2026-06-04T00:00:01.000Z' };
    const appendLiveSamplesFromDetail = vi.fn(useUiStore.getState().appendLiveSamplesFromDetail);
    useUiStore.setState({ appendLiveSamplesFromDetail });

    const { rerender } = renderDetail(first);
    expect(await screen.findByText('Lab GPU')).toBeDefined();

    rerender(
      <QueryClientProvider client={makeQueryClient()}>
        <ServerDetailScreen selectedServerId="server-1" />
      </QueryClientProvider>
    );

    await waitFor(() => expect(appendLiveSamplesFromDetail).toHaveBeenCalledTimes(1));
    const key = getLiveGpuSampleKey('server-1', 1);
    expect(useUiStore.getState().liveSamples[key]).toHaveLength(1);
    expect(useUiStore.getState().liveSamples[key][0].encoderUtilizationPercent).toBe(12.3);
  });

  it('queries stored 1h GPU history and prefers stored samples matched by index before UUID fallback', async () => {
    const { container } = renderDetail(
      detailFixture,
      historyResponse([
        {
          serverId: 'server-1',
          serverName: 'Lab GPU',
          gpuIndex: 99,
          gpuUuid: 'GPU-nullable',
          name: 'UUID fallback GPU',
          samples: [historySample({ gpuUtilizationPercent: 22 })]
        },
        {
          serverId: 'server-1',
          serverName: 'Lab GPU',
          gpuIndex: 1,
          gpuUuid: 'GPU-index-wins',
          name: 'Index primary GPU',
          samples: [historySample({ gpuUtilizationPercent: 77, receivedAt: '2026-06-04T00:00:30.000Z' })]
        },
        {
          serverId: 'server-1',
          serverName: 'Lab GPU',
          gpuIndex: 98,
          gpuUuid: 'GPU-populated',
          name: 'UUID secondary GPU',
          samples: [historySample({ gpuUtilizationPercent: 88, receivedAt: '2026-06-04T00:00:45.000Z' })]
        }
      ])
    );

    expect(await screen.findAllByText('Chart source: Stored history')).toHaveLength(2);
    expect(listGpuHistory).toHaveBeenCalledWith('server-1', null, null, '1h');
    expect(container.querySelector('[data-chart-point-value="22"]')).toBeDefined();
    expect(container.querySelector('[data-chart-point-value="77"]')).toBeDefined();
    expect(container.querySelector('[data-chart-point-value="88"]')).toBeNull();
  });

  it('uses session live fallback while stored history is still loading', async () => {
    useUiStore.setState({
      liveSamples: {
        [getLiveGpuSampleKey('server-1', 1)]: [sessionSample({ gpuUtilizationPercent: 64 })]
      }
    });

    const pendingHistory = new Promise<GpuHistoryResponseDto>(() => undefined);
    const { container } = renderDetail(detailFixture, pendingHistory);

    expect(await screen.findAllByText('Chart source: Session live fallback')).toHaveLength(2);
    expect(listGpuHistory).toHaveBeenCalledWith('server-1', null, null, '1h');
    expect(container.querySelector('[data-chart-point-value="64"]')).toBeDefined();
  });

  it('keeps using session live fallback when stored history is empty for a GPU', async () => {
    useUiStore.setState({
      liveSamples: {
        [getLiveGpuSampleKey('server-1', 1)]: [sessionSample({ gpuUtilizationPercent: 71 })]
      }
    });

    const { container } = renderDetail(
      detailFixture,
      historyResponse([
        {
          serverId: 'server-1',
          serverName: 'Lab GPU',
          gpuIndex: 1,
          gpuUuid: 'GPU-populated',
          name: 'NVIDIA Clocked GPU',
          samples: []
        }
      ])
    );

    expect(await screen.findAllByText('Chart source: Session live fallback')).toHaveLength(2);
    expect(container.querySelector('[data-chart-point-value="71"]')).toBeDefined();
  });

  it('does not append failed replacement snapshots or render them as stored chart samples', async () => {
    const failedDetail = {
      ...detailFixture,
      health: { ...detailFixture.health, status: 'failed replacement', lastSuccessAt: '2026-06-04T00:00:00.000Z' },
      receivedAt: '2026-06-04T00:01:00.000Z'
    };
    const appendLiveSamplesFromDetail = vi.fn(useUiStore.getState().appendLiveSamplesFromDetail);
    useUiStore.setState({ appendLiveSamplesFromDetail });

    renderDetail(failedDetail, historyResponse());

    expect(await screen.findAllByText('Chart source: Session live fallback')).toHaveLength(2);
    expect(appendLiveSamplesFromDetail).not.toHaveBeenCalled();
    expect(useUiStore.getState().liveSamples).toEqual({});
    expect(screen.queryByText('Chart source: Stored history')).toBeNull();
  });

  it('renders rich optional GPU metrics and live history charts without fabricated zeroes', async () => {
    useUiStore.setState({
      liveSamples: {
        [getLiveGpuSampleKey('server-1', 1)]: [
          {
            serverId: 'server-1',
            gpuIndex: 1,
            gpuUuid: 'GPU-populated',
            receivedAt: '2026-06-04T00:00:00.000Z',
            memoryUsedMiB: 24_576,
            memoryFreeMiB: 24_576,
            memoryTotalMiB: 49_152,
            gpuUtilizationPercent: 40,
            memoryUtilizationPercent: 50,
            encoderUtilizationPercent: 10,
            decoderUtilizationPercent: 3,
            jpegUtilizationPercent: null,
            ofaUtilizationPercent: null,
            pcieRxKibPerSec: 1000,
            pcieTxKibPerSec: null,
            temperatureCelsius: null,
            powerDrawWatt: null,
            powerLimitWatt: null,
            stale: false,
            source: 'live'
          },
          {
            serverId: 'server-1',
            gpuIndex: 1,
            gpuUuid: 'GPU-populated',
            receivedAt: '2026-06-04T00:00:30.000Z',
            memoryUsedMiB: 32_768,
            memoryFreeMiB: 16_384,
            memoryTotalMiB: 49_152,
            gpuUtilizationPercent: 83.2,
            memoryUtilizationPercent: 67.4,
            encoderUtilizationPercent: 12.3,
            decoderUtilizationPercent: 4.5,
            jpegUtilizationPercent: null,
            ofaUtilizationPercent: null,
            pcieRxKibPerSec: 1536,
            pcieTxKibPerSec: null,
            temperatureCelsius: null,
            powerDrawWatt: null,
            powerLimitWatt: null,
            stale: false,
            source: 'live'
          }
        ]
      }
    });

    renderDetail();

    expect(await screen.findAllByText('Live utilization')).toHaveLength(2);
    expect(screen.getAllByText('PCIe')).toHaveLength(2);
    expect(screen.getAllByText('MIG')).toHaveLength(2);
    expect(screen.getAllByText('History')).toHaveLength(2);
    expect(screen.getAllByText('Encoder').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Decoder').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('JPEG')).toHaveLength(2);
    expect(screen.getAllByText('OFA')).toHaveLength(2);
    expect(screen.getByText('1,536 KiB/s')).toBeDefined();
    expect(screen.getByText('2,048 KiB/s')).toBeDefined();
    expect(screen.getByText('Gen 4')).toBeDefined();
    expect(screen.getByText('x16')).toBeDefined();
    expect(screen.getByText('Enabled')).toBeDefined();
    expect(screen.getByText('Disabled')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByRole('img', { name: 'GPU 1 GPU utilization history' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'GPU 1 memory usage history' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'GPU 1 encoder utilization history' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'GPU 1 decoder utilization history' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'GPU 1 PCIe RX history' })).toBeDefined();
    expect(screen.getAllByText('Not enough samples').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('0 KiB/s')).toBeNull();
  });

  it('shows a stale last-success note near charts when detail health is stale or failed', async () => {
    renderDetail({
      ...detailFixture,
      health: {
        ...detailFixture.health,
        status: 'stale',
        lastSuccessAt: '2026-06-04T00:00:00.000Z',
        lastErrorMessage: 'ssh timeout'
      }
    });

    expect(await screen.findAllByText(/Charts use the last successful snapshot/)).toHaveLength(2);
    expect(screen.getByText('ssh timeout')).toBeDefined();
  });
});
