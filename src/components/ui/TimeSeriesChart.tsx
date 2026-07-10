import { buildTimeSeries, timeSeriesPath } from './chartMath';
import type { TimeSeriesChartDensity, TimeSeriesChartRange, TimeSeriesChartSample, TimeSeriesChartSeries, TimeSeriesTimestampSelector } from './chartTypes';

type TimeSeriesChartProps<T extends TimeSeriesChartSample> = {
  readonly ariaLabel: string;
  readonly density?: TimeSeriesChartDensity;
  readonly emptyLabel?: string;
  readonly gapThresholdSeconds?: number;
  readonly height?: number;
  readonly pollingIntervalSeconds?: number | null;
  readonly range?: TimeSeriesChartRange;
  readonly samples: readonly T[];
  readonly series: readonly TimeSeriesChartSeries<T>[];
  readonly timestamp?: TimeSeriesTimestampSelector<T>;
};

export const TimeSeriesChart = <T extends TimeSeriesChartSample,>({
  ariaLabel,
  density = 'full',
  emptyLabel = 'Not enough samples',
  gapThresholdSeconds,
  height,
  pollingIntervalSeconds,
  range,
  samples,
  series,
  timestamp
}: TimeSeriesChartProps<T>) => {
  const width = density === 'compact' ? 320 : 560;
  const chartHeight = height ?? (density === 'compact' ? 88 : 140);
  const renderableSeries = buildTimeSeries({
    gapThresholdSeconds,
    height: chartHeight,
    pollingIntervalSeconds,
    range,
    samples,
    series,
    timestamp,
    width
  });
  const hasPoints = renderableSeries.some((entry) => entry.points.length > 0);

  if (!hasPoints) {
    return <div className={`time-series-chart time-series-chart-${density} time-series-chart-empty`}>{emptyLabel}</div>;
  }

  const gapTop = 10;
  const gapBottom = chartHeight - gapTop;

  return (
    <div className={`time-series-chart time-series-chart-${density}`}>
      <svg aria-label={ariaLabel} className="time-series-chart-svg" height={chartHeight} role="img" viewBox={`0 0 ${width} ${chartHeight}`} width={width}>
        <title>{ariaLabel}</title>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line className="time-series-chart-grid" key={ratio} x1="0" x2={width} y1={Number((chartHeight * ratio).toFixed(2))} y2={Number((chartHeight * ratio).toFixed(2))} />
        ))}
        {renderableSeries.flatMap((entry) =>
          entry.gaps.map((gap) => (
            <line
              className={`time-series-chart-gap time-series-chart-series-${entry.tone}`}
              data-chart-gap={gap.reason}
              data-chart-gap-seconds={gap.deltaSeconds === undefined ? undefined : String(gap.deltaSeconds)}
              key={gap.key}
              x1={gap.x}
              x2={gap.x}
              y1={gapTop}
              y2={gapBottom}
            />
          ))
        )}
        {renderableSeries.flatMap((entry) =>
          entry.segments
            .filter((segment) => segment.length > 1)
            .map((segment, segmentIndex) => (
              <path
                className={`time-series-chart-line time-series-chart-series-${entry.tone}`}
                d={timeSeriesPath(segment)}
                data-chart-series-id={entry.id}
                fill="none"
                key={`${entry.id}-${segmentIndex}`}
              />
            ))
        )}
        {renderableSeries.flatMap((entry) =>
          entry.points.map((point) => (
            <circle
              className={`time-series-chart-point time-series-chart-series-${entry.tone}`}
              cx={point.x}
              cy={point.y}
              data-chart-point-series-id={point.seriesId}
              data-chart-point-value={String(point.value)}
              key={`${point.seriesId}-${point.timestampMs}-${point.value}`}
              r={density === 'compact' ? 2.2 : 2.8}
            />
          ))
        )}
      </svg>
      <div aria-hidden="true" className="time-series-chart-legend">
        {renderableSeries.map((entry) => (
          <span className={`time-series-chart-legend-item time-series-chart-series-${entry.tone}`} key={entry.id}>
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
};
