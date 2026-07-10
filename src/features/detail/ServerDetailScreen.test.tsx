import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerDetailScreen } from './ServerDetailScreen';
import { getServerDetail, listGpuHistory } from '../../lib/api';
import { getLiveGpuSampleKey } from '../../lib/liveHistory';
import { useUiStore } from '../../lib/store';
import type { GpuHistoryResponseDto, ServerDetailDto } from '../../lib/types';
import { detailFixture, historyResponse, historySample, sessionSample } from '../../test-utils/detail-fixtures';
import { makeTestQueryClient, renderWithQueryClient } from '../../test-utils/query';

const apiMocks = vi.hoisted(() => ({
  getServerDetail: vi.fn(),
  listGpuHistory: vi.fn(),
  refreshServer: vi.fn()
}));

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

type QueryWithRefetchInterval = {
  options: {
    refetchInterval?: (query: unknown) => number | false;
  };
};

const renderDetail = (detail: ServerDetailDto = detailFixture, historyResult: GpuHistoryResponseDto | Promise<GpuHistoryResponseDto> = historyResponse()) => {
  vi.mocked(getServerDetail).mockResolvedValue(detail);
  vi.mocked(listGpuHistory).mockReturnValue(Promise.resolve(historyResult));
  return renderWithQueryClient(<ServerDetailScreen selectedServerId={detail.server.id} />);
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

  it('summarizes enabled MIG near the GPU title and names the collected instance count', async () => {
    renderDetail();

    const gpuArticle = (await screen.findByText('NVIDIA Clocked GPU')).closest('article');
    expect(gpuArticle).not.toBeNull();

    const gpu = within(gpuArticle ?? document.body);
    expect(gpu.getByText('MIG enabled')).toBeDefined();
    expect(gpu.getByText('Mode current: Enabled')).toBeDefined();
    expect(gpu.getByText('Mode pending: Disabled')).toBeDefined();
    expect(gpu.getByText('Instance count: 2 instances')).toBeDefined();
    expect(gpu.getByText('Instance-level MIG topology is not collected yet.')).toBeDefined();
  });

  it('renders nullable MIG fields as unknown without fabricating zero instances', async () => {
    renderDetail();

    const gpuArticle = (await screen.findByText('NVIDIA Test GPU')).closest('article');
    expect(gpuArticle).not.toBeNull();

    const gpu = within(gpuArticle ?? document.body);
    expect(gpu.getByText('MIG unknown')).toBeDefined();
    expect(gpu.getByText('Mode current: unknown')).toBeDefined();
    expect(gpu.getByText('Mode pending: unknown')).toBeDefined();
    expect(gpu.getByText('Instance count: unknown')).toBeDefined();
    expect(gpu.getByText('MIG availability is unknown for this GPU.')).toBeDefined();
    expect(gpu.queryByText('Instance count: 0 instances')).toBeNull();
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
      <QueryClientProvider client={makeTestQueryClient()}>
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

  it('renders server health and refresh diagnostics guidance in bounded detail surfaces', async () => {
    // Given: detail health reports a missing nvidia-smi diagnostic and refresh reports a GPU query diagnostic.
    apiMocks.refreshServer.mockResolvedValue({ ok: false, status: 'error', errorType: 'remote_gpu_query_failed', message: 'nvidia-smi failed for /Users/alice/.ssh/id_ed25519' });
    renderDetail({
      ...detailFixture,
      health: {
        ...detailFixture.health,
        status: 'error',
        lastErrorType: 'nvidia_smi_missing',
        lastErrorMessage: null
      }
    });

    // When: the user inspects health and retries refresh from the detail header.
    expect(await screen.findByText('nvidia-smi unavailable')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh server' }));

    // Then: both diagnostics expose label, type, sanitized message, and short formatter guidance without hiding screen identity.
    expect(screen.getByText('Type: nvidia_smi_missing')).toBeDefined();
    expect(screen.getByText('Message: unknown')).toBeDefined();
    expect(screen.getByText(/nvidia-smi is available on PATH/)).toBeDefined();
    expect(await screen.findByText('Remote GPU query failed')).toBeDefined();
    expect(screen.getByText('Type: remote_gpu_query_failed')).toBeDefined();
    expect(screen.getByText(/nvidia-smi failed for \[path redacted\]/)).toBeDefined();
    expect(screen.getByText(/permissions allow reading GPU device state/)).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.getByText('Server Detail')).toBeDefined();
  });
});
