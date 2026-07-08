import { TimeSeriesChart, type TimeSeriesChartSeries } from '../../components/ui';
import { formatTime } from '../../lib/format';
import type { GpuHistoryResponseDto, GpuHistorySeriesDto } from '../../lib/types';
import {
  chartSeriesKey,
  gpuLabel,
  historyMetricById,
  latestMetricValue,
  toChartSamples,
  type HistoryChartSample,
  type HistoryMetricId
} from './historyModel';

export const HistoryCharts = ({
  history,
  selectedMetrics,
  visibleSeries
}: {
  readonly history: GpuHistoryResponseDto;
  readonly selectedMetrics: readonly HistoryMetricId[];
  readonly visibleSeries: readonly GpuHistorySeriesDto[];
}) => (
  <>
    <div className="grid gap-4 xl:grid-cols-2">
      {selectedMetrics.map((metricId) => {
        const metric = historyMetricById.get(metricId);
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
                <div className="font-[var(--font-display)] text-2xl font-black tracking-[-0.05em] text-[color:var(--color-accent)]">{metric.formatter(latestMetricValue(visibleSeries, metric.id))}</div>
              </div>
            </div>
            <div className="mt-4">
              <TimeSeriesChart ariaLabel={`${metric.label} stored history`} emptyLabel={`No ${metric.label.toLowerCase()} samples`} pollingIntervalSeconds={history.pollingIntervalSeconds} range={metric.range} samples={chartSamples} series={chartSeries} />
            </div>
          </article>
        );
      })}
    </div>
    <p className="text-xs leading-5 text-[color:var(--color-muted)]">
      Window {formatTime(history.startedAt)} to {formatTime(history.finishedAt)}. Unknown latest values mean the stored sample carried a null metric; visual gaps preserve null samples and inferred poll gaps.
    </p>
  </>
);
