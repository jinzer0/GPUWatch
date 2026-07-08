import { TimeSeriesChart, type TimeSeriesChartSeries } from '../../components/ui';
import type { GpuCardDto, ServerDetailDto } from '../../lib/types';
import {
  gpuHistoryMetrics,
  lastSuccessChartNote,
  shouldShowLastSuccessNote,
  sourceLabelByType,
  type GpuHistoryChartSample,
  type GpuHistoryChartSource,
  type GpuHistoryMetricKey
} from './detailModel';

const GpuHistoryChart = ({ ariaLabel, label, metricKey, range, samples }: { readonly ariaLabel: string; readonly label: string; readonly metricKey: GpuHistoryMetricKey; readonly range?: { readonly max?: number; readonly min?: number }; readonly samples: readonly GpuHistoryChartSample[] }) => {
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

export const DetailGpuHistorySection = ({ detail, gpu, samples, source }: { readonly detail: ServerDetailDto; readonly gpu: GpuCardDto; readonly samples: readonly GpuHistoryChartSample[]; readonly source: GpuHistoryChartSource }) => (
  <div className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="eyebrow">History</div>
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs font-semibold">
        <span className="rounded-full border border-[color:var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-1 text-[color:var(--color-accent)]">Chart source: {sourceLabelByType[source]}</span>
        {shouldShowLastSuccessNote(detail) ? <span className="text-[color:var(--color-stale)]">{lastSuccessChartNote(detail)}</span> : null}
      </div>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-3">
      {gpuHistoryMetrics.map((metric) => (
        <GpuHistoryChart ariaLabel={`GPU ${gpu.index} ${metric.aria}`} key={metric.key} label={metric.label} metricKey={metric.key} range={metric.range} samples={samples} />
      ))}
    </div>
  </div>
);
