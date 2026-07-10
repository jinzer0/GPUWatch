import { miniLineChartPoints, miniLineChartSegments } from './chartMath';
import type { MiniLinePoint } from './chartTypes';

type MiniLineChartProps = {
  readonly ariaLabel: string;
  readonly density?: 'full' | 'compact';
  readonly emptyLabel?: string;
  readonly values: readonly (number | null | undefined)[];
};

export const MiniLineChart = ({ ariaLabel, density = 'full', emptyLabel = 'Not enough samples', values }: MiniLineChartProps) => {
  const width = density === 'compact' ? 120 : 180;
  const height = density === 'compact' ? 34 : 56;
  const points = miniLineChartPoints(values, width, height);

  if (points.length === 0) {
    return <div className={`mini-line-chart mini-line-chart-${density} mini-line-chart-empty`}>{emptyLabel}</div>;
  }

  const numericPoints = points.filter((point): point is MiniLinePoint => point !== null);
  const segments = miniLineChartSegments(points);

  return (
    <div className={`mini-line-chart mini-line-chart-${density}`}>
      <svg aria-label={ariaLabel} className="mini-line-chart-svg" height={height} role="img" viewBox={`0 0 ${width} ${height}`} width={width}>
        {segments.map((segment) => (
          <polyline
            className="mini-line-chart-line"
            fill="none"
            key={segment.map((point) => point.index).join('-')}
            points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
          />
        ))}
        {numericPoints.map((point) => (
          <circle
            className="mini-line-chart-point"
            cx={point.x}
            cy={point.y}
            data-chart-point-value={String(point.value)}
            key={`${point.index}-${point.value}`}
            r={density === 'compact' ? 1.8 : 2.4}
          />
        ))}
      </svg>
    </div>
  );
};
