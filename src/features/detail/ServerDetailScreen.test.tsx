import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerDetailScreen } from './ServerDetailScreen';
import { getServerDetail, listGpuHistory, listWatchRules, refreshServer, saveGpuAvailableWatch } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { ServerDetailDto, WatchRule } from '../../lib/types';
import { detailFixture } from '../../test-utils/detail-fixtures';
import { renderWithQueryClient } from '../../test-utils/query';

const apiMocks = vi.hoisted(() => ({
  getServerDetail: vi.fn(),
  listGpuHistory: vi.fn(),
  listWatchRules: vi.fn(),
  saveGpuAvailableWatch: vi.fn(),
  refreshServer: vi.fn()
}));

vi.mock('../../lib/api', () => ({
  getServerDetail: apiMocks.getServerDetail,
  listGpuHistory: apiMocks.listGpuHistory,
  listWatchRules: apiMocks.listWatchRules,
  queryKeys: {
    detail: (id: string) => ['server-detail', id],
    overview: ['overview'],
    processes: ['processes'],
    watchRules: (serverId: string) => ['watch-rules', serverId]
  },
  refreshServer: apiMocks.refreshServer,
  saveGpuAvailableWatch: apiMocks.saveGpuAvailableWatch
}));

type QueryWithRefetchInterval = {
  options: {
    refetchInterval?: (query: unknown) => number | false;
  };
};

const renderDetail = (detail: ServerDetailDto = detailFixture) => {
  vi.mocked(getServerDetail).mockResolvedValue(detail);
  return renderWithQueryClient(<ServerDetailScreen selectedServerId={detail.server.id} />);
};

const gpuDisclosure = async (name: string): Promise<HTMLDetailsElement> => {
  const heading = await screen.findByText(name);
  const disclosure = heading.closest('details');
  expect(disclosure).toBeInstanceOf(HTMLDetailsElement);
  return disclosure as HTMLDetailsElement;
};

const setDisclosureOpen = async (disclosure: HTMLDetailsElement, open: boolean) => {
  if (disclosure.open !== open) {
    const summary = disclosure.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
  }
  await waitFor(() => expect(disclosure.open).toBe(open));
};

const openAdditionalMetrics = async (disclosure: HTMLDetailsElement) => {
  await setDisclosureOpen(disclosure, true);
  const nested = within(disclosure).getByText('추가 지표').closest('details');
  expect(nested).toBeInstanceOf(HTMLDetailsElement);
  await setDisclosureOpen(nested as HTMLDetailsElement, true);
  return nested as HTMLDetailsElement;
};

const expandAllGpus = async () => {
  await setDisclosureOpen(await gpuDisclosure('NVIDIA Test GPU'), true);
  await setDisclosureOpen(await gpuDisclosure('NVIDIA Clocked GPU'), true);
};

const watchRule = (overrides: Partial<WatchRule> = {}): WatchRule => ({
  id: 'watch-1',
  serverId: detailFixture.server.id,
  gpuUuid: detailFixture.gpus[0].uuid,
  gpuIndex: detailFixture.gpus[0].index,
  enabled: true,
  utilizationThresholdPercent: 5,
  memoryThresholdMiB: 1024,
  sustainSeconds: 300,
  cooldownSeconds: 900,
  createdAt: '2026-06-07T00:00:00Z',
  updatedAt: '2026-06-07T00:00:00Z',
  ...overrides
});

describe('ServerDetailScreen', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    apiMocks.listWatchRules.mockResolvedValue([]);
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders no-selected-server empty state without querying or fabricating detail fields', () => {
    renderWithQueryClient(<ServerDetailScreen selectedServerId={null} />);

    expect(screen.getByText('No server selected')).toBeDefined();
    expect(screen.getByText('Choose a server from the sidebar, or add a server using server management.')).toBeDefined();
    expect(getServerDetail).not.toHaveBeenCalled();
    expect(listGpuHistory).not.toHaveBeenCalled();
    expect(screen.queryByText(detailFixture.server.name)).toBeNull();
    expect(screen.queryByText(detailFixture.server.host)).toBeNull();
    expect(screen.queryByText(detailFixture.health.status)).toBeNull();
  });

  it('renders loading state without fabricating selected server detail fields', () => {
    vi.mocked(getServerDetail).mockReturnValue(new Promise<ServerDetailDto>(() => undefined));
    renderWithQueryClient(<ServerDetailScreen selectedServerId={detailFixture.server.id} />);

    expect(screen.getByText('Loading server detail DTO...')).toBeDefined();
    expect(listGpuHistory).not.toHaveBeenCalled();
    expect(screen.queryByText(detailFixture.server.name)).toBeNull();
    expect(screen.queryByText(detailFixture.server.host)).toBeNull();
    expect(screen.queryByText(detailFixture.health.status)).toBeNull();
  });

  it('renders error state without fabricating selected server detail fields', async () => {
    vi.mocked(getServerDetail).mockRejectedValue(new Error('backend_unavailable for /Users/alice/.ssh/id_ed25519 token=secret-token'));
    renderWithQueryClient(<ServerDetailScreen selectedServerId={detailFixture.server.id} />);

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/backend_unavailable for \[path redacted\] token=\[redacted\]/)).toBeDefined();
    expect(screen.queryByText(/secret-token/)).toBeNull();
    expect(screen.queryByText(detailFixture.server.name)).toBeNull();
    expect(screen.queryByText(detailFixture.server.host)).toBeNull();
    expect(screen.queryByText(detailFixture.health.status)).toBeNull();
  });

  it('names the refresh action with the selected server after detail loads', async () => {
    renderDetail();
    const refreshButton = await screen.findByRole('button', { name: /Refresh/ });
    expect(refreshButton.textContent).toContain(detailFixture.server.name);
  });

  it('renders a missing-server empty state without fabricated GPU or server data', async () => {
    vi.mocked(getServerDetail).mockResolvedValue(null);
    renderWithQueryClient(<ServerDetailScreen selectedServerId={detailFixture.server.id} />);
    expect(await screen.findByText('Server not found')).toBeDefined();
    expect(screen.getByText('The selected server is no longer available in backend storage.')).toBeDefined();
    expect(screen.queryByText(detailFixture.server.name)).toBeNull();
    expect(screen.queryByText('NVIDIA Test GPU')).toBeNull();
    expect(listGpuHistory).not.toHaveBeenCalled();
  });

  it('renders the plain Detail header and compact health strip', async () => {
    renderDetail({
      ...detailFixture,
      collectorHostname: 'collector-a100-01',
      driverVersion: '550.54.14',
      cudaVersion: '12.4',
      receivedAt: '2026-06-04T00:01:00.000Z',
      health: { ...detailFixture.health, status: 'stale', lastSuccessAt: '2026-06-04T00:00:00.000Z' }
    });

    expect(await screen.findByText('Detail')).toBeDefined();
    expect(screen.queryByText('Server Detail')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: detailFixture.server.name })).toBeDefined();
    expect(screen.getByText('alice@gpu.example.test:22')).toBeDefined();
    const health = within(screen.getByRole('list', { name: 'Server health' }));
    for (const label of ['Health', 'Last successful poll', 'Snapshot received', 'Driver / CUDA', 'Collector']) {
      expect(health.getByText(label)).toBeDefined();
    }
  });

  it('moves latest-error details out of metric cells while keeping bounded diagnostics and warnings visible', async () => {
    apiMocks.refreshServer.mockResolvedValue({
      ok: false,
      status: 'error',
      errorType: 'remote_gpu_query_failed',
      message: 'nvidia-smi failed for /Users/alice/.ssh/id_ed25519 --access-token raw-refresh-token password hunter2'
    });
    renderDetail({
      ...detailFixture,
      health: {
        ...detailFixture.health,
        status: 'error',
        lastErrorType: 'nvidia_smi_missing',
        lastErrorMessage: 'ssh failed with token=raw-health-token via /Users/alice/.ssh/id_ed25519'
      }
    });

    expect(await screen.findByText('pmon unavailable; per-process utilization unknown')).toBeDefined();
    expect(screen.queryByText('Latest error type')).toBeNull();
    expect(screen.queryByText('Latest error')).toBeNull();
    const healthDiagnostic = screen.getByRole('region', { name: 'Health diagnostic' });
    expect(within(healthDiagnostic).getByText('Type: nvidia_smi_missing')).toBeDefined();
    expect(within(healthDiagnostic).getByText(/token=\[redacted\]/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Refresh ${detailFixture.server.name}`) }));
    const refreshDiagnostic = await screen.findByRole('region', { name: 'Refresh diagnostic' });
    expect(within(refreshDiagnostic).getByText('Type: remote_gpu_query_failed')).toBeDefined();
    expect(within(refreshDiagnostic).getByText(/nvidia-smi failed for \[path redacted\]/)).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.queryByText(/raw-health-token|raw-refresh-token|hunter2/)).toBeNull();
  });

  it('shows GPU identity and three meters while keeping watch controls outside collapsed summaries', async () => {
    renderDetail();
    expect(await screen.findByRole('heading', { level: 3, name: 'GPUs' })).toBeDefined();
    const first = await gpuDisclosure('NVIDIA Test GPU');
    const second = await gpuDisclosure('NVIDIA Clocked GPU');
    expect(first.open).toBe(false);
    expect(second.open).toBe(false);
    for (const disclosure of [first, second]) {
      const summary = disclosure.querySelector('summary');
      expect(summary).not.toBeNull();
      expect(within(summary as HTMLElement).getAllByRole('meter')).toHaveLength(3);
      expect(summary?.querySelector('button')).toBeNull();
    }
    expect(first.querySelector('summary')?.textContent).toContain('GPU 0');
    expect(second.querySelector('summary')?.textContent).toContain('GPU 1');
    expect(within(second).getByRole('meter', { name: 'GPU 사용률' }).getAttribute('aria-valuenow')).toBe('83.2');
    expect(Number(within(second).getByRole('meter', { name: 'VRAM 점유율' }).getAttribute('aria-valuenow'))).toBeCloseTo(100 * 32768 / 49152);
    expect(within(second).getByRole('meter', { name: '온도' }).getAttribute('aria-valuenow')).toBe('71.5');
    expect(within(first).getByRole('meter', { name: 'GPU 사용률' }).getAttribute('aria-valuenow')).toBeNull();
  });

  it('allows multiple GPUs and additional metrics to stay expanded independently', async () => {
    renderDetail();
    const first = await gpuDisclosure('NVIDIA Test GPU');
    const second = await gpuDisclosure('NVIDIA Clocked GPU');
    const firstMetrics = await openAdditionalMetrics(first);
    expect(second.open).toBe(false);
    const secondMetrics = await openAdditionalMetrics(second);
    await waitFor(() => expect(useUiStore.getState().gpuDisclosures['server-1']).toEqual({
      'uuid:GPU-nullable': { expanded: true, metricsExpanded: true },
      'uuid:GPU-populated': { expanded: true, metricsExpanded: true }
    }));
    await setDisclosureOpen(firstMetrics, false);
    expect(first.open).toBe(true);
    expect(second.open).toBe(true);
    expect(secondMetrics.open).toBe(true);
    await waitFor(() => expect(useUiStore.getState().gpuDisclosures['server-1']['uuid:GPU-nullable']).toEqual({
      expanded: true, metricsExpanded: false
    }));
    await setDisclosureOpen(first, false);
    expect(second.open).toBe(true);
    expect(secondMetrics.open).toBe(true);
  });

  it('records native toggle events and preserves independent state through a new polling snapshot', async () => {
    const { queryClient } = renderDetail();
    const first = await gpuDisclosure('NVIDIA Test GPU');
    first.open = true;
    fireEvent(first, new Event('toggle'));
    const nested = within(first).getByText('추가 지표').closest('details') as HTMLDetailsElement;
    nested.open = true;
    fireEvent(nested, new Event('toggle'));
    await waitFor(() => expect(useUiStore.getState().gpuDisclosures['server-1']['uuid:GPU-nullable']).toEqual({
      expanded: true, metricsExpanded: true
    }));
    act(() => queryClient.setQueryData(['server-detail', 'server-1'], {
      ...detailFixture,
      receivedAt: '2026-06-04T00:01:00.000Z',
      gpus: detailFixture.gpus.map((gpu) => ({ ...gpu, gpuUtilizationPercent: 30.1 }))
    }));
    await waitFor(() => expect(within(first).getByRole('meter', { name: 'GPU 사용률' }).getAttribute('aria-valuenow')).toBe('30.1'));
    expect(first.open).toBe(true);
    expect(nested.open).toBe(true);
    first.open = false;
    fireEvent(first, new Event('toggle'));
    await waitFor(() => expect(useUiStore.getState().gpuDisclosures['server-1']['uuid:GPU-nullable']).toEqual({
      expanded: false, metricsExpanded: true
    }));
  });

  it('retains nested state through parent closure and server switches within the session', async () => {
    vi.mocked(getServerDetail).mockImplementation(async (serverId: string) => ({
      ...detailFixture,
      server: { ...detailFixture.server, id: serverId, name: serverId }
    }));
    const { rerender, queryClient } = renderWithQueryClient(<ServerDetailScreen selectedServerId="server-1" />);
    const first = await gpuDisclosure('NVIDIA Test GPU');
    await openAdditionalMetrics(first);
    await setDisclosureOpen(first, false);
    await waitFor(() => expect(useUiStore.getState().gpuDisclosures['server-1']['uuid:GPU-nullable']).toEqual({
      expanded: false, metricsExpanded: true
    }));
    await setDisclosureOpen(first, true);
    expect(within(first).getByText('추가 지표').closest('details')?.open).toBe(true);
    rerender(<QueryClientProvider client={queryClient}><ServerDetailScreen selectedServerId="server-2" /></QueryClientProvider>);
    await screen.findByRole('heading', { level: 2, name: 'server-2' });
    const other = await gpuDisclosure('NVIDIA Test GPU');
    expect(other.open).toBe(false);
    await setDisclosureOpen(other, true);
    expect(within(other).getByText('추가 지표').closest('details')?.open).toBe(false);
    rerender(<QueryClientProvider client={queryClient}><ServerDetailScreen selectedServerId="server-1" /></QueryClientProvider>);
    await screen.findByRole('heading', { level: 2, name: 'server-1' });
    const restored = await gpuDisclosure('NVIDIA Test GPU');
    expect(restored.open).toBe(true);
    expect(within(restored).getByText('추가 지표').closest('details')?.open).toBe(true);
  });

  it('prefers UUID disclosure identity and falls back to index for empty and whitespace UUIDs', async () => {
    useUiStore.setState({ gpuDisclosures: { 'server-1': {
      'uuid:GPU-nullable': { expanded: true, metricsExpanded: true },
      'index:7': { expanded: false, metricsExpanded: false }
    } } });
    renderDetail({
      ...detailFixture,
      gpus: [
        { ...detailFixture.gpus[0], index: 7 },
        { ...detailFixture.gpus[1], index: 8, uuid: '' },
        { ...detailFixture.gpus[0], index: 9, uuid: '   ', name: 'Whitespace UUID GPU' }
      ]
    });
    const identified = await gpuDisclosure('NVIDIA Test GPU');
    expect(identified.open).toBe(true);
    expect(within(identified).getByText('추가 지표').closest('details')?.open).toBe(true);
    await setDisclosureOpen(identified, false);
    await waitFor(() => expect(useUiStore.getState().gpuDisclosures['server-1']['uuid:GPU-nullable']).toEqual({
      expanded: false, metricsExpanded: true
    }));
    await setDisclosureOpen(await gpuDisclosure('NVIDIA Clocked GPU'), true);
    await setDisclosureOpen(await gpuDisclosure('Whitespace UUID GPU'), true);
    await waitFor(() => {
      const state = useUiStore.getState().gpuDisclosures['server-1'];
      expect(state['index:8']).toEqual({ expanded: true, metricsExpanded: false });
      expect(state['index:9']).toEqual({ expanded: true, metricsExpanded: false });
      expect(state['index:7']).toEqual({ expanded: false, metricsExpanded: false });
      expect(state['uuid:']).toBeUndefined();
      expect(state['uuid:   ']).toBeUndefined();
    });
  });

  it.each(['online', 'stale'])('does not infer current availability from busy=false with %s health', async (status) => {
    renderDetail({ ...detailFixture, health: { ...detailFixture.health, status } });
    const gpu = await gpuDisclosure('NVIDIA Test GPU');
    await setDisclosureOpen(gpu, true);
    expect(within(gpu).getByRole('button', { name: 'Notify when available' })).toBeDefined();
    expect(within(gpu).queryByText(/^(available|free|현재 사용 가능|사용 가능)$/i)).toBeNull();
    expect(within(gpu).queryByText('알림 활성화')).toBeNull();
    if (status === 'stale') {
      expect(within(gpu).getByText(/마지막 성공 스냅샷입니다. 현재 상태가 아닙니다./)).toBeDefined();
    }
  });

  it('states explicitly when an expanded GPU has no active processes', async () => {
    renderDetail();
    const gpu = await gpuDisclosure('NVIDIA Clocked GPU');
    await setDisclosureOpen(gpu, true);
    expect(within(gpu).getByText('실행 중인 GPU 프로세스가 없습니다.')).toBeDefined();
  });

  it('preserves unknown process user, command and VRAM rather than inventing empty or zero data', async () => {
    renderDetail();
    const gpu = await gpuDisclosure('NVIDIA Test GPU');
    await setDisclosureOpen(gpu, true);
    const table = within(gpu).getByRole('table', { name: 'GPU 프로세스' });
    const row = within(table).getByText('1234').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByText('unknown')).toHaveLength(3);
    expect(within(row as HTMLElement).queryByText('0 MiB')).toBeNull();
  });

  it('keeps full host, UUID and commands while distinguishing unknown process memory from real zero', async () => {
    const longCommand = '/opt/ml/experiments/phase-4/bin/train --model llama-70b --dataset /mnt/research/extremely-long-dataset-name --notes keep-full-command-visible';
    const longUuid = 'GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-ffffffffffff-111111111111';
    const longHost = 'gpu-node-with-a-very-long-hostname.research-cluster.example.test';
    renderDetail({
      ...detailFixture,
      server: { ...detailFixture.server, host: longHost },
      gpus: [{ ...detailFixture.gpus[0], uuid: longUuid, processCount: 2, processes: [
        { pid: 4321, username: 'very-long-service-account-name', command: longCommand,
          gpuMemoryUsedMiB: null, gpuUtilizationPercent: null, cpuPercent: null, hostMemoryUsedMiB: null },
        { pid: 4322, username: 'alice', command: 'idle worker',
          gpuMemoryUsedMiB: 0, gpuUtilizationPercent: 0, cpuPercent: 0, hostMemoryUsedMiB: 0 }
      ] }]
    });
    expect(await screen.findByText(`alice@${longHost}:22`)).toBeDefined();
    const gpu = await gpuDisclosure('NVIDIA Test GPU');
    await openAdditionalMetrics(gpu);
    expect(within(gpu).getByText(longUuid)).toBeDefined();
    const command = within(gpu).getByText(longCommand);
    expect(command.getAttribute('title')).toBe(longCommand);
    const unknownRow = command.closest('tr');
    const zeroRow = within(gpu).getByText('idle worker').closest('tr');
    expect(unknownRow).not.toBeNull();
    expect(zeroRow).not.toBeNull();
    expect(within(unknownRow as HTMLElement).getByText('unknown')).toBeDefined();
    expect(within(unknownRow as HTMLElement).queryByText('0 MiB')).toBeNull();
    expect(within(zeroRow as HTMLElement).getByText('0 MiB')).toBeDefined();
    expect(within(zeroRow as HTMLElement).queryByText('unknown')).toBeNull();
  });

  it('keeps warnings visible and nullable additional metrics unknown without fabricated zero', async () => {
    renderDetail();
    expect(await screen.findByText('pmon unavailable; per-process utilization unknown')).toBeDefined();
    const metrics = await openAdditionalMetrics(await gpuDisclosure('NVIDIA Test GPU'));
    const content = within(metrics);
    for (const label of ['Memory activity', 'Memory free', 'Fan', 'Encoder', 'Decoder', 'JPEG', 'OFA',
      'PCI bus id', 'Per-GPU driver', 'Graphics clock', 'Memory clock', 'RX', 'TX',
      'Link generation', 'Link width', 'Current mode', 'Pending mode', 'Instance count']) {
      const metric = content.getByText(label).parentElement;
      expect(metric).not.toBeNull();
      expect(within(metric as HTMLElement).getByText('unknown')).toBeDefined();
    }
    expect(content.getByText('unknown / unknown')).toBeDefined();
    expect(content.queryByText('0.0%')).toBeNull();
    expect(content.queryByText('0 MiB')).toBeNull();
    expect(content.queryByText('0 MHz')).toBeNull();
    expect(content.getByText('MIG availability is unknown for this GPU.')).toBeDefined();
    expect(content.queryByText('0 instances')).toBeNull();
  });

  it('preserves every populated optional metric once additional metrics are open', async () => {
    renderDetail();
    const gpu = await gpuDisclosure('NVIDIA Clocked GPU');
    const metrics = await openAdditionalMetrics(gpu);
    const content = within(metrics);
    for (const label of ['Memory activity', 'Memory free', 'Power / limit', 'Fan', '스냅샷 프로세스 수',
      'UUID', 'Encoder', 'Decoder', 'JPEG', 'OFA', 'PCI bus id', 'Per-GPU driver', 'Graphics clock',
      'Memory clock', 'RX', 'TX', 'Link generation', 'Link width', 'Current mode', 'Pending mode', 'Instance count']) {
      expect(content.getByText(label)).toBeDefined();
    }
    for (const value of ['67.4%', '16,384 MiB', '225.3 W / 300.0 W', '46.2%', '0', 'GPU-populated',
      '12.3%', '4.5%', '6.7%', '8.9%', '00000000:65:00.0', '550.54.14', '1,410 MHz', '5,001 MHz',
      '1,536 KiB/s', '2,048 KiB/s', 'Gen 4', 'x16', 'Enabled', 'Disabled', '2 instances',
      'Instance-level MIG topology is not collected yet.']) {
      expect(content.getByText(value)).toBeDefined();
    }
    expect(gpu.querySelector('summary')?.textContent).toContain('32,768 MiB / 49,152 MiB');
  });

  it('does not substitute server driver metadata for unknown per-GPU driver metadata', async () => {
    renderDetail({ ...detailFixture, driverVersion: 'server-only-driver' });
    const metrics = await openAdditionalMetrics(await gpuDisclosure('NVIDIA Test GPU'));
    const driverMetric = within(metrics).getByText('Per-GPU driver').parentElement;
    expect(driverMetric).not.toBeNull();
    expect(within(driverMetric as HTMLElement).getByText('unknown')).toBeDefined();
    expect(within(metrics).queryByText('server-only-driver')).toBeNull();
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

  it('never queries GPU history on load or manual refresh and invalidates only current detail surfaces', async () => {
    apiMocks.refreshServer.mockResolvedValue({ ok: true, status: 'online', errorType: null, message: 'refresh queued' });
    const { queryClient } = renderDetail();
    await screen.findByRole('heading', { level: 2, name: detailFixture.server.name });
    expect(listGpuHistory).not.toHaveBeenCalled();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Refresh ${detailFixture.server.name}`) }));
    await waitFor(() => expect(refreshServer).toHaveBeenCalled());
    expect(vi.mocked(refreshServer).mock.calls[0]?.[0]).toBe(detailFixture.server.id);
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(3));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['server-detail', detailFixture.server.id] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['overview'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['processes'] });
    expect(listGpuHistory).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().findAll({ queryKey: ['gpu-history'] })).toHaveLength(0);
  });

  it('renders server health and refresh diagnostics guidance in bounded detail surfaces', async () => {
    apiMocks.refreshServer.mockResolvedValue({
      ok: false,
      status: 'error',
      errorType: 'remote_gpu_query_failed',
      message: 'nvidia-smi failed for /Users/alice/.ssh/id_ed25519 --access-token raw-refresh-token password hunter2'
    });
    renderDetail({
      ...detailFixture,
      health: {
        ...detailFixture.health,
        status: 'error',
        lastErrorType: 'nvidia_smi_missing',
        lastErrorMessage: 'ssh failed with token=raw-health-token via /Users/alice/.ssh/id_ed25519'
      }
    });
    expect(await screen.findByText('nvidia-smi unavailable')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Refresh ${detailFixture.server.name}`) }));
    expect(await screen.findByText('Remote GPU query failed')).toBeDefined();
    expect(screen.getByText('Type: nvidia_smi_missing')).toBeDefined();
    expect(screen.getAllByText(/token=\[redacted\]/)).toHaveLength(2);
    expect(screen.getByText(/nvidia-smi is available on PATH/)).toBeDefined();
    expect(screen.getByText('Refresh diagnostic')).toBeDefined();
    expect(screen.getByText('Type: remote_gpu_query_failed')).toBeDefined();
    expect(screen.getByText(/nvidia-smi failed for \[path redacted\]/)).toBeDefined();
    expect(screen.getByText(/permissions allow reading GPU device state/)).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.queryByText(/raw-health-token|raw-refresh-token|hunter2/)).toBeNull();
    expect(screen.queryByText(/^success$/i)).toBeNull();
    expect(screen.getByText('Detail')).toBeDefined();
  });

  it('matches non-null watch UUIDs exactly and uses GPU index only for null UUID rules', async () => {
    vi.mocked(listWatchRules).mockResolvedValue([
      watchRule({ id: 'wrong-uuid', gpuUuid: 'GPU-other', gpuIndex: 0 }),
      watchRule({ id: 'index-fallback', gpuUuid: null, gpuIndex: 1 }),
      watchRule({ id: 'uuid-wins', gpuUuid: 'GPU-populated', gpuIndex: 99 })
    ]);
    renderDetail();
    await expandAllGpus();
    const nullableGpu = within(await gpuDisclosure('NVIDIA Test GPU'));
    const populatedGpu = within(await gpuDisclosure('NVIDIA Clocked GPU'));
    expect(nullableGpu.getByRole('button', { name: 'Notify when available' })).toBeDefined();
    expect(populatedGpu.getByText('알림 활성화')).toBeDefined();
    expect(populatedGpu.getByRole('button', { name: 'Disable availability watch for GPU 1' })).toBeDefined();
  });

  it('associates the exact availability explanation with each enable and disable control', async () => {
    vi.mocked(listWatchRules).mockResolvedValue([watchRule()]);
    renderDetail();
    await expandAllGpus();
    const enableButton = await screen.findByRole('button', { name: 'Notify when available' });
    const disableButton = screen.getByRole('button', { name: 'Disable availability watch for GPU 0' });
    const enableDescriptionId = enableButton.getAttribute('aria-describedby');
    const disableDescriptionId = disableButton.getAttribute('aria-describedby');
    expect(enableDescriptionId).toBeTruthy();
    expect(disableDescriptionId).toBeTruthy();
    expect(enableDescriptionId).not.toBe(disableDescriptionId);
    expect(document.getElementById(enableDescriptionId ?? '')?.textContent).toBe('GPU 사용률 ≤ 5%, VRAM ≤ 1GB가 5분 지속되면 알림');
    expect(document.getElementById(disableDescriptionId ?? '')?.textContent).toBe('GPU 사용률 ≤ 5%, VRAM ≤ 1GB가 5분 지속되면 알림');
  });

  it('treats rejected watch-rule reads as unknown persisted state without allowing saves', async () => {
    vi.mocked(listWatchRules).mockRejectedValue(new Error('watch read failed token=secret-token via /Users/alice/.ssh/id_ed25519'));
    renderDetail();
    await expandAllGpus();
    const diagnostic = await screen.findByRole('region', { name: 'Watch diagnostic' });
    expect(within(diagnostic).getByText(/watch read failed token=\[redacted\] via \[path redacted\]/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Notify when available' })).toBeNull();
    const unavailableControls = screen.getAllByRole('button', { name: 'Watch status unavailable' });
    expect(unavailableControls).toHaveLength(2);
    expect(unavailableControls.every((control) => control.hasAttribute('disabled'))).toBe(true);
    fireEvent.click(unavailableControls[0]);
    expect(saveGpuAvailableWatch).not.toHaveBeenCalled();
    expect(screen.queryByText(/secret-token|\/Users\/alice/)).toBeNull();
  });

  it('enables a GPU watch with backend defaults and refetches only server watch rules after success', async () => {
    const enabledRule = watchRule();
    vi.mocked(listWatchRules).mockResolvedValueOnce([]).mockResolvedValue([enabledRule]);
    vi.mocked(saveGpuAvailableWatch).mockResolvedValue(enabledRule);
    const { queryClient } = renderDetail();
    await expandAllGpus();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const firstGpu = within(await gpuDisclosure('NVIDIA Test GPU'));
    fireEvent.click(firstGpu.getByRole('button', { name: 'Notify when available' }));
    await waitFor(() => expect(saveGpuAvailableWatch).toHaveBeenCalledTimes(1));
    expect(saveGpuAvailableWatch).toHaveBeenCalledWith({
      id: null,
      serverId: 'server-1',
      gpuUuid: 'GPU-nullable',
      gpuIndex: 0,
      enabled: true,
      utilizationThresholdPercent: null,
      memoryThresholdMiB: null,
      sustainSeconds: null,
      cooldownSeconds: null
    });
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['watch-rules', 'server-1'] }));
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(await firstGpu.findByText('알림 활성화')).toBeDefined();
  });

  it('disables an existing watch by saving its persisted fields with enabled false', async () => {
    const enabledRule = watchRule();
    vi.mocked(listWatchRules).mockResolvedValueOnce([enabledRule]).mockResolvedValue([{ ...enabledRule, enabled: false }]);
    vi.mocked(saveGpuAvailableWatch).mockResolvedValue({ ...enabledRule, enabled: false });
    renderDetail();
    await expandAllGpus();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable availability watch for GPU 0' }));
    await waitFor(() => expect(saveGpuAvailableWatch).toHaveBeenCalledWith({
      id: enabledRule.id,
      serverId: enabledRule.serverId,
      gpuUuid: enabledRule.gpuUuid,
      gpuIndex: enabledRule.gpuIndex,
      enabled: false,
      utilizationThresholdPercent: enabledRule.utilizationThresholdPercent,
      memoryThresholdMiB: enabledRule.memoryThresholdMiB,
      sustainSeconds: enabledRule.sustainSeconds,
      cooldownSeconds: enabledRule.cooldownSeconds
    }));
    const firstGpu = within(await gpuDisclosure('NVIDIA Test GPU'));
    expect(await firstGpu.findByRole('button', { name: 'Notify when available' })).toBeDefined();
  });

  it('prevents rapid duplicate watch saves and disables only the pending GPU control', async () => {
    let resolveSave: ((rule: WatchRule) => void) | undefined;
    vi.mocked(saveGpuAvailableWatch).mockReturnValue(new Promise<WatchRule>((resolve) => {
      resolveSave = resolve;
    }));
    renderDetail();
    await expandAllGpus();
    const firstGpu = within(await gpuDisclosure('NVIDIA Test GPU'));
    const secondGpu = within(await gpuDisclosure('NVIDIA Clocked GPU'));
    const firstGpuButton = firstGpu.getByRole('button', { name: 'Notify when available' });
    fireEvent.click(firstGpuButton);
    fireEvent.click(firstGpuButton);
    await waitFor(() => expect(saveGpuAvailableWatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(firstGpuButton.hasAttribute('disabled')).toBe(true));
    expect(secondGpu.getByRole('button', { name: 'Notify when available' }).hasAttribute('disabled')).toBe(false);
    resolveSave?.(watchRule());
  });

  it('does not carry a pending GPU mutation to another server with the same GPU index', async () => {
    let resolveSave: ((rule: WatchRule) => void) | undefined;
    vi.mocked(saveGpuAvailableWatch).mockReturnValue(new Promise<WatchRule>((resolve) => {
      resolveSave = resolve;
    }));
    vi.mocked(getServerDetail).mockImplementation(async (serverId: string) => ({
      ...detailFixture,
      server: { ...detailFixture.server, id: serverId, name: serverId },
      gpus: [{ ...detailFixture.gpus[0], uuid: `GPU-${serverId}` }]
    }));
    vi.mocked(listWatchRules).mockResolvedValue([]);
    const { rerender, queryClient } = renderWithQueryClient(<ServerDetailScreen selectedServerId="server-1" />);
    await setDisclosureOpen(await gpuDisclosure('NVIDIA Test GPU'), true);
    const firstServerButton = await screen.findByRole('button', { name: 'Notify when available' });
    fireEvent.click(firstServerButton);
    await waitFor(() => expect(firstServerButton.hasAttribute('disabled')).toBe(true));
    rerender(<QueryClientProvider client={queryClient}><ServerDetailScreen selectedServerId="server-2" /></QueryClientProvider>);
    await screen.findByRole('heading', { level: 2, name: 'server-2' });
    await setDisclosureOpen(await gpuDisclosure('NVIDIA Test GPU'), true);
    const secondServerButton = await screen.findByRole('button', { name: 'Notify when available' });
    expect(secondServerButton.hasAttribute('disabled')).toBe(false);
    resolveSave?.(watchRule());
  });

  it('keeps the disabled state and surfaces a sanitized watch diagnostic when save fails', async () => {
    vi.mocked(saveGpuAvailableWatch).mockRejectedValue(new Error('watch failed token=secret-token via /Users/alice/.ssh/id_ed25519'));
    renderDetail();
    await expandAllGpus();
    const firstGpu = within(await gpuDisclosure('NVIDIA Test GPU'));
    fireEvent.click(firstGpu.getByRole('button', { name: 'Notify when available' }));
    expect(await screen.findByRole('region', { name: 'Watch diagnostic' })).toBeDefined();
    expect(screen.getByText(/watch failed token=\[redacted\] via \[path redacted\]/)).toBeDefined();
    expect(screen.queryByText('알림 활성화')).toBeNull();
    expect(screen.queryByText(/secret-token|\/Users\/alice/)).toBeNull();
  });

  it('renders disabled watch controls when the persisted-rule read returns the browser empty fallback', async () => {
    vi.mocked(listWatchRules).mockResolvedValue([]);
    renderDetail();
    await expandAllGpus();
    expect(await screen.findAllByRole('button', { name: 'Notify when available' })).toHaveLength(2);
    expect(screen.queryByText('알림 활성화')).toBeNull();
  });
});
