import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryMonitorScreen } from './HistoryMonitorScreen';
import { listGpuHistory } from '../../lib/api';
import type { GpuHistoryResponseDto, ServerOverviewDto } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  listGpuHistory: vi.fn(),
  queryKeys: {
    gpuHistory: (serverId: string | null | undefined, gpuIndex: number | null | undefined, gpuUuid: string | null | undefined, range: string) => [
      'gpu-history',
      serverId ?? null,
      gpuIndex ?? null,
      gpuUuid ?? null,
      range
    ]
  }
}));

const listGpuHistoryMock = vi.mocked(listGpuHistory);

const overviewRows: ServerOverviewDto[] = [
  {
    id: 'server-1',
    name: 'Lab GPU',
    host: 'lab.example.test',
    status: 'online',
    gpuTotal: 2,
    busyGpuCount: 1,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: 42,
    averageMemoryUsagePercent: 55,
    maxTemperatureCelsius: 70,
    lastSuccessAt: '2026-06-04T00:03:00.000Z',
    lastErrorType: null,
    lastErrorMessage: null
  },
  {
    id: 'server-2',
    name: 'Render GPU',
    host: 'render.example.test',
    status: 'stale',
    gpuTotal: 1,
    busyGpuCount: 0,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: null,
    averageMemoryUsagePercent: null,
    maxTemperatureCelsius: null,
    lastSuccessAt: null,
    lastErrorType: 'ssh_timeout',
    lastErrorMessage: 'timeout'
  }
];

const historyFixture: GpuHistoryResponseDto = {
  serverId: 'server-1',
  serverName: 'Lab GPU',
  pollingIntervalSeconds: 30,
  range: '1h',
  startedAt: '2026-06-04T00:00:00.000Z',
  finishedAt: '2026-06-04T00:03:00.000Z',
  series: [
    {
      serverId: 'server-1',
      serverName: 'Lab GPU',
      gpuIndex: 0,
      gpuUuid: 'GPU-0',
      name: 'NVIDIA Test 0',
      samples: [
        {
          receivedAt: '2026-06-04T00:00:00.000Z',
          memoryTotalMiB: 24576,
          memoryUsedMiB: 1024,
          memoryFreeMiB: 23552,
          gpuUtilizationPercent: 10,
          memoryUtilizationPercent: 20,
          encoderUtilizationPercent: null,
          decoderUtilizationPercent: null,
          jpegUtilizationPercent: null,
          ofaUtilizationPercent: null,
          temperatureCelsius: 45,
          powerDrawWatt: 120,
          powerLimitWatt: 300,
          pcieRxKibPerSec: 256,
          pcieTxKibPerSec: 512
        },
        {
          receivedAt: '2026-06-04T00:00:30.000Z',
          memoryTotalMiB: 24576,
          memoryUsedMiB: null,
          memoryFreeMiB: null,
          gpuUtilizationPercent: null,
          memoryUtilizationPercent: 25,
          encoderUtilizationPercent: 3,
          decoderUtilizationPercent: 4,
          jpegUtilizationPercent: null,
          ofaUtilizationPercent: null,
          temperatureCelsius: null,
          powerDrawWatt: null,
          powerLimitWatt: 300,
          pcieRxKibPerSec: null,
          pcieTxKibPerSec: 700
        },
        {
          receivedAt: '2026-06-04T00:01:00.000Z',
          memoryTotalMiB: 24576,
          memoryUsedMiB: null,
          memoryFreeMiB: null,
          gpuUtilizationPercent: 20,
          memoryUtilizationPercent: 30,
          encoderUtilizationPercent: 5,
          decoderUtilizationPercent: 6,
          jpegUtilizationPercent: null,
          ofaUtilizationPercent: null,
          temperatureCelsius: 47,
          powerDrawWatt: 130,
          powerLimitWatt: 300,
          pcieRxKibPerSec: 1024,
          pcieTxKibPerSec: 2048
        }
      ]
    },
    {
      serverId: 'server-1',
      serverName: 'Lab GPU',
      gpuIndex: 1,
      gpuUuid: 'GPU-1',
      name: 'NVIDIA Test 1',
      samples: [
        {
          receivedAt: '2026-06-04T00:00:00.000Z',
          memoryTotalMiB: 24576,
          memoryUsedMiB: 2048,
          memoryFreeMiB: 22528,
          gpuUtilizationPercent: 50,
          memoryUtilizationPercent: 40,
          encoderUtilizationPercent: 8,
          decoderUtilizationPercent: 9,
          jpegUtilizationPercent: null,
          ofaUtilizationPercent: null,
          temperatureCelsius: 50,
          powerDrawWatt: 140,
          powerLimitWatt: 300,
          pcieRxKibPerSec: 4096,
          pcieTxKibPerSec: 8192
        },
        {
          receivedAt: '2026-06-04T00:01:00.000Z',
          memoryTotalMiB: 24576,
          memoryUsedMiB: 4096,
          memoryFreeMiB: 20480,
          gpuUtilizationPercent: 60,
          memoryUtilizationPercent: 45,
          encoderUtilizationPercent: 10,
          decoderUtilizationPercent: 12,
          jpegUtilizationPercent: null,
          ofaUtilizationPercent: null,
          temperatureCelsius: 51,
          powerDrawWatt: 150,
          powerLimitWatt: 300,
          pcieRxKibPerSec: 8192,
          pcieTxKibPerSec: 16384
        }
      ]
    }
  ]
};

const emptyHistoryFixture: GpuHistoryResponseDto = {
  ...historyFixture,
  series: []
};

const makeDeferredHistory = () => {
  let resolvePromise: ((value: GpuHistoryResponseDto) => void) | null = null;
  const promise = new Promise<GpuHistoryResponseDto>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: GpuHistoryResponseDto) => resolvePromise?.(value)
  };
};

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderHistoryMonitor = (props: { overview?: ServerOverviewDto[]; selectedServerId?: string | null } = {}) =>
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <HistoryMonitorScreen overview={props.overview ?? overviewRows} selectedServerId={props.selectedServerId ?? null} />
    </QueryClientProvider>
  );

describe('HistoryMonitorScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listGpuHistoryMock.mockResolvedValue(historyFixture);
  });

  it('shows an empty state and never queries history without an overview server id', () => {
    renderHistoryMonitor({ overview: [] });

    expect(screen.getByText('Stored GPU history')).toBeDefined();
    expect(screen.getByText('No servers available')).toBeDefined();
    expect(listGpuHistoryMock).not.toHaveBeenCalled();
  });

  it('renders loading and error states with shared primitives', async () => {
    listGpuHistoryMock.mockReturnValue(new Promise(() => undefined));
    const loadingRender = renderHistoryMonitor();

    expect(screen.getByText('Loading stored GPU history...')).toBeDefined();
    loadingRender.unmount();

    listGpuHistoryMock.mockRejectedValue(new Error('history unavailable'));
    renderHistoryMonitor();

    expect(await screen.findByText('history unavailable')).toBeDefined();
  });

  it('uses selected UI-store server when present, otherwise the first overview row, without blank history calls', async () => {
    renderHistoryMonitor({ selectedServerId: 'server-2' });

    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-2', null, null, '1h'));
    expect(listGpuHistoryMock).not.toHaveBeenCalledWith('', null, null, '1h');

    listGpuHistoryMock.mockClear();
    renderHistoryMonitor({ selectedServerId: null });

    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-1', null, null, '1h'));
  });

  it('adopts later valid selected server changes and queries that server history', async () => {
    const queryClient = makeQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <HistoryMonitorScreen overview={overviewRows} selectedServerId="server-1" />
      </QueryClientProvider>
    );

    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-1', null, null, '1h'));
    listGpuHistoryMock.mockClear();

    rerender(
      <QueryClientProvider client={queryClient}>
        <HistoryMonitorScreen overview={overviewRows} selectedServerId="server-2" />
      </QueryClientProvider>
    );

    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-2', null, null, '1h'));
    expect((screen.getByRole('combobox', { name: 'Server' }) as HTMLSelectElement).value).toBe('server-2');
  });

  it('renders the required header, toolbar controls, default metrics, and grouped charts on success', async () => {
    renderHistoryMonitor();

    expect(await screen.findByText('Successful poll samples only; gaps mean no stored sample.')).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Server' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'GPU' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Range' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'GPU util' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Memory util' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Memory used' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Temperature' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Power' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Encoder' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Decoder' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'PCIe RX' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'PCIe TX' })).toBeDefined();
    expect(await screen.findByRole('img', { name: 'GPU util stored history' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Memory util stored history' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Memory used stored history' })).toBeDefined();
    expect(screen.queryByRole('img', { name: 'Temperature stored history' })).toBeNull();
  });

  it('updates server and range query calls through toolbar interactions', async () => {
    renderHistoryMonitor();
    await screen.findByRole('img', { name: 'GPU util stored history' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Range' }), { target: { value: '6h' } });
    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-1', null, null, '6h'));

    fireEvent.change(screen.getByRole('combobox', { name: 'Server' }), { target: { value: 'server-2' } });
    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-2', null, null, '6h'));
  });

  it('refreshes the current history read model and preserves selected server, range, GPU, and metrics', async () => {
    renderHistoryMonitor();
    await screen.findByRole('img', { name: 'GPU util stored history' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Range' }), { target: { value: '6h' } });
    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-1', null, null, '6h'));
    await waitFor(() => expect(screen.getByRole('option', { name: 'GPU 1 - NVIDIA Test 1' })).toBeDefined());
    fireEvent.change(screen.getByRole('combobox', { name: 'GPU' }), { target: { value: '1::GPU-1' } });
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'GPU' }) as HTMLSelectElement).value).toBe('1::GPU-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Temperature' }));
    fireEvent.click(screen.getByRole('button', { name: 'GPU util' }));

    const deferredRefresh = makeDeferredHistory();
    listGpuHistoryMock.mockClear();
    listGpuHistoryMock.mockReturnValueOnce(deferredRefresh.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));

    expect(screen.getByRole('status', { name: 'History refresh' }).textContent).toContain('pending');
    await waitFor(() => expect(listGpuHistoryMock).toHaveBeenCalledWith('server-1', null, null, '6h'));
    expect(listGpuHistoryMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('combobox', { name: 'Server' }) as HTMLSelectElement).value).toBe('server-1');
    expect((screen.getByRole('combobox', { name: 'Range' }) as HTMLSelectElement).value).toBe('6h');
    expect((screen.getByRole('combobox', { name: 'GPU' }) as HTMLSelectElement).value).toBe('1::GPU-1');
    expect(screen.getByRole('button', { name: 'Temperature' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'GPU util' }).getAttribute('aria-pressed')).toBe('false');

    deferredRefresh.resolve({ ...historyFixture, range: '6h' });

    expect((await screen.findByRole('status', { name: 'History refresh result' })).textContent).toContain('success');
    expect((screen.getByRole('combobox', { name: 'Server' }) as HTMLSelectElement).value).toBe('server-1');
    expect((screen.getByRole('combobox', { name: 'Range' }) as HTMLSelectElement).value).toBe('6h');
    expect((screen.getByRole('combobox', { name: 'GPU' }) as HTMLSelectElement).value).toBe('1::GPU-1');
    expect(screen.getByRole('button', { name: 'Temperature' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'GPU util' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows sanitized failed refresh feedback while keeping history controls visible', async () => {
    renderHistoryMonitor();
    await screen.findByRole('img', { name: 'GPU util stored history' });

    fireEvent.change(screen.getByRole('combobox', { name: 'GPU' }), { target: { value: '1::GPU-1' } });
    listGpuHistoryMock.mockClear();
    listGpuHistoryMock.mockRejectedValueOnce(new Error('history failed for /Users/alice/.ssh/id_ed25519 --token secret-value'));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));

    const alert = await screen.findByRole('alert', { name: 'History refresh result' });
    expect(alert.textContent).toContain('[path redacted]');
    expect(alert.textContent).toContain('--token=[redacted]');
    expect(alert.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(alert.textContent).not.toContain('secret-value');
    expect(screen.getByRole('combobox', { name: 'Server' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Range' })).toBeDefined();
    expect((screen.getByRole('combobox', { name: 'GPU' }) as HTMLSelectElement).value).toBe('1::GPU-1');
    expect(screen.getByRole('button', { name: 'Refresh history' })).toBeDefined();
  });

  it('builds GPU selector values from history series and filters rendered chart series locally', async () => {
    const { container } = renderHistoryMonitor();
    await screen.findByRole('img', { name: 'GPU util stored history' });

    expect(screen.getAllByText('GPU 0 - NVIDIA Test 0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GPU 1 - NVIDIA Test 1').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox', { name: 'GPU' }), { target: { value: '1::GPU-1' } });

    expect(screen.getByText('60.0%')).toBeDefined();
    expect(container.querySelectorAll('[data-chart-point-series-id="1-GPU-1"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-chart-point-series-id="0-GPU-0"]')).toBeNull();
  });

  it('toggles optional metric cards without persistence and preserves null samples as gaps and unknown values', async () => {
    const { container } = renderHistoryMonitor();
    const memoryChart = await screen.findByRole('img', { name: 'Memory used stored history' });

    expect(memoryChart.querySelectorAll('[data-chart-gap="metric-null"]').length).toBeGreaterThan(0);
    expect(screen.getByText('unknown')).toBeDefined();
    expect(screen.queryByText('0 MiB')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Temperature' }));
    expect(await screen.findByRole('img', { name: 'Temperature stored history' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Temperature' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'GPU util' }));
    expect(screen.queryByRole('img', { name: 'GPU util stored history' })).toBeNull();
    expect(container.querySelector('[data-chart-point-value="0"]')).toBeNull();
  });

  it('shows an empty history state when the selected range has no grouped series', async () => {
    listGpuHistoryMock.mockResolvedValue(emptyHistoryFixture);
    renderHistoryMonitor();

    expect(await screen.findByText('No stored GPU history')).toBeDefined();
    expect(screen.queryByRole('img', { name: 'GPU util stored history' })).toBeNull();
  });
});
