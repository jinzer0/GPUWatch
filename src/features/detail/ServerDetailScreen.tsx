import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, MetricCard, StatusBadge, TimeSeriesChart, type TimeSeriesChartSeries } from '../../components/ui';
import { getServerDetail, listGpuHistory, queryKeys, refreshServer } from '../../lib/api';
import {
  formatCommand,
  formatKiBPerSecond,
  formatMiB,
  formatPercent,
  formatTemperature,
  formatTime,
  formatUnknown,
  formatWatts,
  sanitizeMessage
} from '../../lib/format';
import { getLiveGpuSampleKey, type LiveGpuSample } from '../../lib/liveHistory';
import { useUiStore } from '../../lib/store';
import type { CollectorProcess, GpuCardDto, GpuHistoryResponseDto, GpuHistorySampleDto, ServerDetailDto } from '../../lib/types';

type GpuHistoryMetricKey =
  | 'gpuUtilizationPercent'
  | 'memoryUtilizationPercent'
  | 'encoderUtilizationPercent'
  | 'decoderUtilizationPercent'
  | 'pcieRxKibPerSec'
  | 'pcieTxKibPerSec';

type GpuHistoryChartSample = Pick<GpuHistorySampleDto, 'receivedAt' | GpuHistoryMetricKey>;

type GpuHistoryChartSource = 'stored' | 'session';

type GpuHistoryChartData = {
  samples: GpuHistoryChartSample[];
  source: GpuHistoryChartSource;
};

const historyQueryRange = '1h';

const sourceLabelByType: Record<GpuHistoryChartSource, string> = {
  stored: 'Stored history',
  session: 'Session live fallback'
};

const formatClockMhz = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `${value.toLocaleString()} MHz`;
};

const formatPcieGeneration = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `Gen ${value}`;
};

const formatPcieWidth = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `x${value}`;
};

const isFailedReplacementSnapshot = (detail: ServerDetailDto) => detail.health.status.toLowerCase().includes('failed');

const shouldShowLastSuccessNote = (detail: ServerDetailDto) => {
  const status = detail.health.status.toLowerCase();
  return status.includes('stale') || status.includes('offline') || status.includes('error') || status.includes('failed');
};

const ProcessList = ({ processes }: { processes: CollectorProcess[] }) => {
  if (processes.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">No GPU processes reported.</p>;
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left table-head">
          <tr>
            <th className="px-3 py-2">PID</th>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">GPU memory</th>
            <th className="px-3 py-2">Command</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr className="border-t border-[color:var(--color-border)]" key={`${process.pid}-${process.gpuMemoryUsedMiB ?? 'unknown'}`}>
              <td className="px-3 py-2 font-[var(--font-display)]">{process.pid}</td>
              <td className="px-3 py-2">{formatUnknown(process.username)}</td>
              <td className="px-3 py-2">{formatMiB(process.gpuMemoryUsedMiB)}</td>
              <td className="px-3 py-2 text-[color:var(--color-muted)]" title={formatCommand(process.command)}>
                {formatCommand(process.command)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const GpuMetricSection = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <div className="mt-5">
    <div className="eyebrow">{title}</div>
    <div className="mt-3 grid grid-cols-4 gap-3">{children}</div>
  </div>
);

const gpuHistoryMetrics: Array<{ aria: string; key: GpuHistoryMetricKey; label: string; range?: { max?: number; min?: number } }> = [
  { aria: 'GPU utilization history', key: 'gpuUtilizationPercent', label: 'GPU util', range: { min: 0, max: 100 } },
  { aria: 'memory usage history', key: 'memoryUtilizationPercent', label: 'Memory', range: { min: 0, max: 100 } },
  { aria: 'encoder utilization history', key: 'encoderUtilizationPercent', label: 'Encoder', range: { min: 0, max: 100 } },
  { aria: 'decoder utilization history', key: 'decoderUtilizationPercent', label: 'Decoder', range: { min: 0, max: 100 } },
  { aria: 'PCIe RX history', key: 'pcieRxKibPerSec', label: 'PCIe RX', range: { min: 0 } },
  { aria: 'PCIe TX history', key: 'pcieTxKibPerSec', label: 'PCIe TX', range: { min: 0 } }
];

const toGpuHistoryChartSamples = (samples: Array<LiveGpuSample | GpuHistorySampleDto>): GpuHistoryChartSample[] =>
  samples.map((sample) => ({
    receivedAt: sample.receivedAt,
    gpuUtilizationPercent: sample.gpuUtilizationPercent,
    memoryUtilizationPercent: sample.memoryUtilizationPercent,
    encoderUtilizationPercent: sample.encoderUtilizationPercent,
    decoderUtilizationPercent: sample.decoderUtilizationPercent,
    pcieRxKibPerSec: sample.pcieRxKibPerSec,
    pcieTxKibPerSec: sample.pcieTxKibPerSec
  }));

const findStoredGpuSeries = (history: GpuHistoryResponseDto | null, gpu: GpuCardDto) => {
  const seriesWithSamples = history?.series.filter((series) => series.samples.length > 0) ?? [];
  return seriesWithSamples.find((series) => series.gpuIndex === gpu.index) ?? seriesWithSamples.find((series) => series.gpuUuid === gpu.uuid) ?? null;
};

const resolveGpuHistoryChartData = ({
  gpu,
  history,
  isStoredHistoryReady,
  sessionSamples
}: {
  gpu: GpuCardDto;
  history: GpuHistoryResponseDto | null;
  isStoredHistoryReady: boolean;
  sessionSamples: LiveGpuSample[];
}): GpuHistoryChartData => {
  const storedSeries = isStoredHistoryReady ? findStoredGpuSeries(history, gpu) : null;
  if (storedSeries) {
    return { samples: toGpuHistoryChartSamples(storedSeries.samples), source: 'stored' };
  }

  return { samples: toGpuHistoryChartSamples(sessionSamples), source: 'session' };
};

const GpuHistoryChart = ({
  ariaLabel,
  label,
  metricKey,
  range,
  samples
}: {
  ariaLabel: string;
  label: string;
  metricKey: GpuHistoryMetricKey;
  range?: { max?: number; min?: number };
  samples: GpuHistoryChartSample[];
}) => {
  const series: Array<TimeSeriesChartSeries<GpuHistoryChartSample>> = [{ id: metricKey, label, metric: metricKey }];

  return (
    <div className="surface p-3">
      <div className="metric-label">{label}</div>
      <div className="mt-2">
        <TimeSeriesChart ariaLabel={ariaLabel} density="compact" emptyLabel="Not enough samples" range={range} samples={samples} series={series} />
      </div>
    </div>
  );
};

const GpuHistorySection = ({
  detail,
  gpu,
  samples,
  source
}: {
  detail: ServerDetailDto;
  gpu: GpuCardDto;
  samples: GpuHistoryChartSample[];
  source: GpuHistoryChartSource;
}) => (
  <div className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="eyebrow">History</div>
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs font-semibold">
        <span className="rounded-full border border-[color:var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-1 text-[color:var(--color-accent)]">
          Chart source: {sourceLabelByType[source]}
        </span>
        {shouldShowLastSuccessNote(detail) ? <span className="text-[color:var(--color-stale)]">Charts use the last successful snapshot. Last success: {formatTime(detail.health.lastSuccessAt)}.</span> : null}
      </div>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-3">
      {gpuHistoryMetrics.map((metric) => (
        <GpuHistoryChart
          ariaLabel={`GPU ${gpu.index} ${metric.aria}`}
          key={metric.key}
          label={metric.label}
          metricKey={metric.key}
          range={metric.range}
          samples={samples}
        />
      ))}
    </div>
  </div>
);

export const ServerDetailScreen = ({ selectedServerId }: { selectedServerId: string | null }) => {
  const queryClient = useQueryClient();
  const appendLiveSamplesFromDetail = useUiStore((state) => state.appendLiveSamplesFromDetail);
  const liveSamples = useUiStore((state) => state.liveSamples);
  const lastAppendedDetailKey = useRef<string | null>(null);
  const detailQuery = useQuery({
    queryKey: selectedServerId ? queryKeys.detail(selectedServerId) : ['server-detail', 'none'],
    queryFn: () => getServerDetail(selectedServerId ?? ''),
    enabled: selectedServerId !== null,
    refetchInterval: (query) => {
      if (selectedServerId === null) {
        return false;
      }
      const detail = query.state.data as ServerDetailDto | undefined;
      return Math.max((detail?.server.pollingIntervalSeconds ?? 10) * 1000, 5_000);
    }
  });
  const detail = detailQuery.data ?? null;
  const detailServerId = detail?.server.id ?? null;
  const historyQuery = useQuery({
    enabled: Boolean(detailServerId),
    queryFn: () => {
      if (!detailServerId) {
        throw new Error('Select a server before loading GPU history.');
      }
      return listGpuHistory(detailServerId, null, null, historyQueryRange);
    },
    queryKey: queryKeys.gpuHistory(detailServerId, null, null, historyQueryRange),
    refetchInterval: () => (detail ? Math.max(detail.server.pollingIntervalSeconds * 1000, 5_000) : false)
  });
  const refreshMutation = useMutation({
    mutationFn: refreshServer,
    onSuccess: (_result, id) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.gpuHistory(id, null, null, historyQueryRange) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.processes })
      ])
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail?.receivedAt || isFailedReplacementSnapshot(detail)) {
      return;
    }

    const detailKey = `${detail.server.id}:${detail.receivedAt}`;
    if (lastAppendedDetailKey.current === detailKey) {
      return;
    }

    appendLiveSamplesFromDetail(detail);
    lastAppendedDetailKey.current = detailKey;
  }, [appendLiveSamplesFromDetail, detailQuery.data]);

  if (!selectedServerId) {
    return <EmptyState title="No server selected" body="Choose a server from Overview to inspect the latest backend detail DTO." />;
  }

  if (detailQuery.isLoading) {
    return <LoadingState label="Loading server detail DTO..." />;
  }

  if (detailQuery.error) {
    return <ErrorState message={detailQuery.error.message} />;
  }

  if (!detail) {
    return <EmptyState title="Server not found" body="The selected server is no longer available in backend storage." />;
  }

  const storedHistory = historyQuery.isSuccess ? historyQuery.data : null;

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Server Detail</div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="font-[var(--font-display)] text-4xl font-black tracking-[-0.08em]">{detail.server.name}</h2>
              <StatusBadge status={detail.health.status} />
            </div>
            <p className="mt-3 text-sm text-[color:var(--color-muted)]">
              {detail.server.username}@{detail.server.host}:{detail.server.port}
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate(detail.server.id)}
            type="button"
          >
            Refresh server
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Collector hostname" value={formatUnknown(detail.collectorHostname)} />
        <MetricCard label="Driver / CUDA" value={`${formatUnknown(detail.driverVersion)} / ${formatUnknown(detail.cudaVersion)}`} />
        <MetricCard label="Snapshot received" value={formatTime(detail.receivedAt)} />
        <MetricCard label="Last success" value={formatTime(detail.health.lastSuccessAt)} />
        <MetricCard label="Latest error" value={sanitizeMessage(detail.health.lastErrorMessage)} />
      </div>

      {detail.warnings.length > 0 ? (
        <div className="surface p-4 text-sm text-[color:var(--color-stale)]">
          {detail.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4">
        {detail.gpus.map((gpu) => {
          const chartData = resolveGpuHistoryChartData({
            gpu,
            history: storedHistory,
            isStoredHistoryReady: historyQuery.isSuccess,
            sessionSamples: liveSamples[getLiveGpuSampleKey(detail.server.id, gpu.index)] ?? []
          });

          return (
          <article className="panel p-5" key={gpu.uuid}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow">GPU {gpu.index}</div>
                <h3 className="mt-1 font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{gpu.name}</h3>
                <p className="mt-1 text-xs text-[color:var(--color-muted)]">{gpu.uuid}</p>
              </div>
              <StatusBadge status={gpu.busy ? 'busy' : 'free'} />
            </div>
            <div className="mt-5">
              <div className="eyebrow">Identity & clocks</div>
              <div className="mt-3 grid grid-cols-4 gap-3">
                <MetricCard label="PCI bus id" value={formatUnknown(gpu.pciBusId)} />
                <MetricCard label="Per-GPU driver" value={formatUnknown(gpu.driverVersion)} />
                <MetricCard label="Graphics clock" value={formatClockMhz(gpu.graphicsClockMhz)} />
                <MetricCard label="Memory clock" value={formatClockMhz(gpu.memoryClockMhz)} />
              </div>
            </div>
            <GpuMetricSection title="Live utilization">
              <MetricCard label="GPU / SM" value={formatPercent(gpu.gpuUtilizationPercent)} />
              <MetricCard label="Memory" value={formatPercent(gpu.memoryUtilizationPercent)} />
              <MetricCard label="Encoder" value={formatPercent(gpu.encoderUtilizationPercent)} />
              <MetricCard label="Decoder" value={formatPercent(gpu.decoderUtilizationPercent)} />
              <MetricCard label="JPEG" value={formatPercent(gpu.jpegUtilizationPercent)} />
              <MetricCard label="OFA" value={formatPercent(gpu.ofaUtilizationPercent)} />
            </GpuMetricSection>
            <GpuMetricSection title="PCIe">
              <MetricCard label="RX" value={formatKiBPerSecond(gpu.pcieRxKibPerSec)} />
              <MetricCard label="TX" value={formatKiBPerSecond(gpu.pcieTxKibPerSec)} />
              <MetricCard label="Link generation" value={formatPcieGeneration(gpu.pcieLinkGenCurrent)} />
              <MetricCard label="Link width" value={formatPcieWidth(gpu.pcieLinkWidthCurrent)} />
            </GpuMetricSection>
            <GpuMetricSection title="MIG">
              <MetricCard label="Current mode" value={formatUnknown(gpu.migModeCurrent)} />
              <MetricCard label="Pending mode" value={formatUnknown(gpu.migModePending)} />
              <MetricCard label="Instance count" value={formatUnknown(gpu.migInstanceCount)} />
            </GpuMetricSection>
            <div className="mt-5 grid grid-cols-4 gap-3">
              <MetricCard label="Memory used" value={`${formatMiB(gpu.memoryUsedMiB)} / ${formatMiB(gpu.memoryTotalMiB)}`} />
              <MetricCard label="Memory free" value={formatMiB(gpu.memoryFreeMiB)} />
              <MetricCard label="GPU util" value={formatPercent(gpu.gpuUtilizationPercent)} />
              <MetricCard label="Memory util" value={formatPercent(gpu.memoryUtilizationPercent)} />
              <MetricCard label="Temperature" value={formatTemperature(gpu.temperatureCelsius)} />
              <MetricCard label="Power" value={`${formatWatts(gpu.powerDrawWatt)} / ${formatWatts(gpu.powerLimitWatt)}`} />
              <MetricCard label="Fan" value={formatPercent(gpu.fanSpeedPercent)} />
              <MetricCard label="Processes" value={gpu.processCount} />
            </div>
            <GpuHistorySection detail={detail} gpu={gpu} samples={chartData.samples} source={chartData.source} />
            <div className="mt-5">
              <ProcessList processes={gpu.processes} />
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
};
