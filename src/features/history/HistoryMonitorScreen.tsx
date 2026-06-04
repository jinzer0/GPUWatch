import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  InlineToolbar,
  LabeledSelect,
  LoadingState,
  TimeSeriesChart,
  type LabeledSelectOption,
  type TimeSeriesChartSeries
} from '../../components/ui';
import { listGpuHistory, queryKeys } from '../../lib/api';
import { formatKiBPerSecond, formatMiB, formatPercent, formatTemperature, formatTime, formatWatts } from '../../lib/format';
import type { GpuHistoryRange, GpuHistorySampleDto, GpuHistorySeriesDto, ServerOverviewDto } from '../../lib/types';

const ALL_GPU_VALUE = 'all';
const HISTORY_RANGES: GpuHistoryRange[] = ['1h', '6h', '24h'];
const DEFAULT_METRICS = ['gpuUtilizationPercent', 'memoryUtilizationPercent', 'memoryUsedMiB'] as const;

type MetricId =
  | 'gpuUtilizationPercent'
  | 'memoryUtilizationPercent'
  | 'memoryUsedMiB'
  | 'temperatureCelsius'
  | 'powerDrawWatt'
  | 'encoderUtilizationPercent'
  | 'decoderUtilizationPercent'
  | 'pcieRxKibPerSec'
  | 'pcieTxKibPerSec';

type HistoryChartSample = {
  receivedAt: string;
  values: Record<string, number | null | undefined>;
};

type MetricDefinition = {
  formatter: (value: number | null | undefined) => string;
  id: MetricId;
  label: string;
  range?: { min?: number; max?: number };
  unit: string;
};

const metricDefinitions: MetricDefinition[] = [
  { id: 'gpuUtilizationPercent', label: 'GPU util', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'memoryUtilizationPercent', label: 'Memory util', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'memoryUsedMiB', label: 'Memory used', formatter: formatMiB, range: { min: 0 }, unit: 'MiB' },
  { id: 'temperatureCelsius', label: 'Temperature', formatter: formatTemperature, range: { min: 0 }, unit: 'C' },
  { id: 'powerDrawWatt', label: 'Power', formatter: formatWatts, range: { min: 0 }, unit: 'W' },
  { id: 'encoderUtilizationPercent', label: 'Encoder', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'decoderUtilizationPercent', label: 'Decoder', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'pcieRxKibPerSec', label: 'PCIe RX', formatter: formatKiBPerSecond, range: { min: 0 }, unit: 'KiB/s' },
  { id: 'pcieTxKibPerSec', label: 'PCIe TX', formatter: formatKiBPerSecond, range: { min: 0 }, unit: 'KiB/s' }
];

const metricById = new Map(metricDefinitions.map((metric) => [metric.id, metric]));

const gpuOptionValue = (series: GpuHistorySeriesDto) => `${series.gpuIndex}::${series.gpuUuid ?? 'none'}`;

const gpuLabel = (series: GpuHistorySeriesDto) => `GPU ${series.gpuIndex}${series.name ? ` - ${series.name}` : ''}`;

const readMetricValue = (sample: GpuHistorySampleDto, metricId: MetricId) => sample[metricId];

const chartSeriesKey = (series: GpuHistorySeriesDto) => `${series.gpuIndex}-${series.gpuUuid ?? 'none'}`;

const toChartSamples = (seriesList: GpuHistorySeriesDto[], metricId: MetricId) => {
  const samplesByTimestamp = new Map<string, HistoryChartSample>();

  for (const series of seriesList) {
    const key = chartSeriesKey(series);
    for (const sample of series.samples) {
      const existing = samplesByTimestamp.get(sample.receivedAt) ?? { receivedAt: sample.receivedAt, values: {} };
      existing.values[key] = readMetricValue(sample, metricId);
      samplesByTimestamp.set(sample.receivedAt, existing);
    }
  }

  return Array.from(samplesByTimestamp.values()).sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
};

const latestMetricValue = (seriesList: GpuHistorySeriesDto[], metricId: MetricId) => {
  const latestSample = seriesList
    .flatMap((series) => series.samples)
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))[0];

  return latestSample ? readMetricValue(latestSample, metricId) : null;
};

const rangeLabel = (range: GpuHistoryRange) => {
  if (range === '1h') {
    return 'Last 1 hour';
  }
  if (range === '6h') {
    return 'Last 6 hours';
  }
  return 'Last 24 hours';
};

export const HistoryMonitorScreen = ({ overview, selectedServerId }: { overview: ServerOverviewDto[]; selectedServerId: string | null }) => {
  const selectedServerExists = useMemo(() => Boolean(selectedServerId && overview.some((server) => server.id === selectedServerId)), [overview, selectedServerId]);
  const preferredServerId = useMemo(() => {
    if (selectedServerId && selectedServerExists) {
      return selectedServerId;
    }
    return overview[0]?.id ?? null;
  }, [overview, selectedServerExists, selectedServerId]);
  const [activeServerId, setActiveServerId] = useState<string | null>(preferredServerId);
  const [range, setRange] = useState<GpuHistoryRange>('1h');
  const [selectedGpu, setSelectedGpu] = useState(ALL_GPU_VALUE);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricId[]>([...DEFAULT_METRICS]);

  useEffect(() => {
    if (overview.length === 0) {
      setActiveServerId(null);
      return;
    }

    setActiveServerId((currentServerId) => {
      if (selectedServerId && selectedServerExists) {
        return selectedServerId;
      }
      return currentServerId && overview.some((server) => server.id === currentServerId) ? currentServerId : preferredServerId;
    });
  }, [overview, preferredServerId, selectedServerExists, selectedServerId]);

  const historyQuery = useQuery({
    enabled: Boolean(activeServerId),
    queryFn: () => {
      if (!activeServerId) {
        throw new Error('Select a server before loading GPU history.');
      }
      return listGpuHistory(activeServerId, null, null, range);
    },
    queryKey: queryKeys.gpuHistory(activeServerId, null, null, range)
  });

  const history = historyQuery.data ?? null;
  const gpuOptions = useMemo<LabeledSelectOption[]>(() => {
    const seriesOptions = history?.series.map((series) => ({ label: gpuLabel(series), value: gpuOptionValue(series) })) ?? [];
    return [{ label: 'All GPUs', value: ALL_GPU_VALUE }, ...seriesOptions];
  }, [history]);

  useEffect(() => {
    if (selectedGpu !== ALL_GPU_VALUE && !gpuOptions.some((option) => option.value === selectedGpu)) {
      setSelectedGpu(ALL_GPU_VALUE);
    }
  }, [gpuOptions, selectedGpu]);

  const visibleSeries = useMemo(() => {
    const series = history?.series ?? [];
    if (selectedGpu === ALL_GPU_VALUE) {
      return series;
    }
    return series.filter((entry) => gpuOptionValue(entry) === selectedGpu);
  }, [history, selectedGpu]);

  const serverOptions = useMemo<LabeledSelectOption[]>(() => overview.map((server) => ({ label: server.name, value: server.id })), [overview]);
  const activeServer = overview.find((server) => server.id === activeServerId) ?? null;
  const hasConcreteServer = Boolean(activeServerId);
  const hasHistorySeries = visibleSeries.length > 0;
  const hasAnySamples = visibleSeries.some((series) => series.samples.length > 0);

  const toggleMetric = (metricId: MetricId) => {
    setSelectedMetrics((currentMetrics) =>
      currentMetrics.includes(metricId) ? currentMetrics.filter((currentMetric) => currentMetric !== metricId) : [...currentMetrics, metricId]
    );
  };

  if (overview.length === 0) {
    return (
      <section className="space-y-6">
        <div className="panel-strong p-6">
          <div className="eyebrow">Live Monitor</div>
          <h2 className="mt-3 font-[var(--font-display)] text-4xl font-black leading-none tracking-[-0.08em]">Stored GPU history</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">Successful poll samples only; gaps mean no stored sample.</p>
        </div>
        <EmptyState title="No servers available" body="Add or seed a server before opening stored GPU history." />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="panel-strong p-6">
        <div className="eyebrow">Live Monitor</div>
        <h2 className="mt-3 font-[var(--font-display)] text-4xl font-black leading-none tracking-[-0.08em]">Stored GPU history</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">Successful poll samples only; gaps mean no stored sample.</p>
      </div>

      <InlineToolbar
        label="History controls"
        summary={
          activeServer
            ? `${activeServer.name} / ${rangeLabel(range)} / ${visibleSeries.length} GPU series. Null metrics and missing poll intervals render as gaps, not zeroes.`
            : 'Select a server to load stored GPU history.'
        }
      >
        <LabeledSelect
          id="history-server"
          label="Server"
          onChange={(event) => {
            setActiveServerId(event.target.value);
            setSelectedGpu(ALL_GPU_VALUE);
          }}
          options={serverOptions}
          value={activeServerId ?? ''}
        />
        <LabeledSelect id="history-gpu" label="GPU" onChange={(event) => setSelectedGpu(event.target.value)} options={gpuOptions} value={selectedGpu} />
        <LabeledSelect
          id="history-range"
          label="Range"
          onChange={(event) => setRange(event.target.value as GpuHistoryRange)}
          options={HISTORY_RANGES.map((historyRange) => ({ label: rangeLabel(historyRange), value: historyRange }))}
          value={range}
        />
      </InlineToolbar>

      <div className="surface p-4">
        <div className="metric-label">Metrics</div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Metric toggles">
          {metricDefinitions.map((metric) => {
            const isSelected = selectedMetrics.includes(metric.id);
            return (
              <button
                aria-pressed={isSelected}
                className={`btn btn-secondary ${isSelected ? 'border-[color:var(--color-brand)] bg-[var(--color-brand-soft)] text-[color:var(--color-brand)]' : ''}`.trim()}
                key={metric.id}
                onClick={() => toggleMetric(metric.id)}
                type="button"
              >
                {metric.label}
              </button>
            );
          })}
        </div>
      </div>

      {!hasConcreteServer ? <EmptyState title="No server selected" body="Choose a server before loading stored GPU history." /> : null}
      {historyQuery.isLoading ? <LoadingState label="Loading stored GPU history..." /> : null}
      {historyQuery.error ? <ErrorState message={historyQuery.error.message} /> : null}
      {!historyQuery.isLoading && !historyQuery.error && hasConcreteServer && history && (!hasHistorySeries || !hasAnySamples) ? (
        <EmptyState title="No stored GPU history" body="Only successful poll samples are stored. Empty history means this server has no successful samples in the selected range." />
      ) : null}
      {!historyQuery.isLoading && !historyQuery.error && history && hasHistorySeries && hasAnySamples && selectedMetrics.length === 0 ? (
        <EmptyState title="No metrics selected" body="Turn on one or more metrics to render stored GPU history charts." />
      ) : null}

      {!historyQuery.isLoading && !historyQuery.error && history && hasHistorySeries && hasAnySamples && selectedMetrics.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {selectedMetrics.map((metricId) => {
            const metric = metricById.get(metricId);
            if (!metric) {
              return null;
            }
            const chartSamples = toChartSamples(visibleSeries, metric.id);
            const chartSeries: Array<TimeSeriesChartSeries<HistoryChartSample>> = visibleSeries.map((series) => {
              const key = chartSeriesKey(series);
              return {
                id: key,
                label: gpuLabel(series),
                metric: (sample) => sample.values[key]
              };
            });

            return (
              <article className="surface p-4" key={metric.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="metric-label">{metric.unit}</div>
                    <h3 className="mt-1 font-[var(--font-display)] text-2xl font-black leading-none tracking-[-0.06em]">{metric.label}</h3>
                  </div>
                  <div className="text-right">
                    <div className="metric-label">Latest</div>
                    <div className="font-[var(--font-display)] text-2xl font-black tracking-[-0.05em] text-[color:var(--color-accent)]">
                      {metric.formatter(latestMetricValue(visibleSeries, metric.id))}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <TimeSeriesChart
                    ariaLabel={`${metric.label} stored history`}
                    emptyLabel={`No ${metric.label.toLowerCase()} samples`}
                    pollingIntervalSeconds={history.pollingIntervalSeconds}
                    range={metric.range}
                    samples={chartSamples}
                    series={chartSeries}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {history ? (
        <p className="text-xs leading-5 text-[color:var(--color-muted)]">
          Window {formatTime(history.startedAt)} to {formatTime(history.finishedAt)}. Unknown latest values mean the stored sample carried a null metric; visual gaps preserve null samples and inferred poll gaps.
        </p>
      ) : null}
    </section>
  );
};
