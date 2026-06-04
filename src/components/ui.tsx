import { useEffect } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

import { formatUnknown } from '../lib/format';

const statusClasses = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('online')) {
    return 'status-online';
  }
  if (normalized.includes('error') || normalized.includes('failed')) {
    return 'status-error';
  }
  if (normalized.includes('stale') || normalized.includes('polling')) {
    return 'status-stale';
  }
  if (normalized.includes('disabled')) {
    return 'status-disabled';
  }
  return 'status-neutral';
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(status)}`}>
    {formatUnknown(status)}
  </span>
);

export const MetricCard = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'accent' }) => (
  <div className="surface p-4">
    <div className="metric-label">{label}</div>
    <div className={tone === 'accent' ? 'metric-value text-[color:var(--color-accent)]' : 'metric-value'}>{value}</div>
  </div>
);

export const EmptyState = ({ title, body }: { title: string; body: string }) => (
  <div className="surface flex min-h-48 flex-col items-center justify-center p-8 text-center">
    <div className="section-title">{title}</div>
    <p className="mt-3 max-w-lg text-sm text-[color:var(--color-muted)]">{body}</p>
  </div>
);

export const ErrorState = ({ message }: { message: string }) => (
  <div className="surface border-[color:var(--color-error)] p-4 text-sm text-[color:var(--color-error)]">{message}</div>
);

export const LoadingState = ({ label }: { label: string }) => (
  <div className="surface p-6 text-sm text-[color:var(--color-muted)]">{label}</div>
);

export const InlineToolbar = ({ children, label, summary }: { children: ReactNode; label?: string; summary?: ReactNode }) => (
  <div className="surface flex flex-wrap items-end justify-between gap-3 p-4">
    {label || summary ? (
      <div className="min-w-48 flex-1">
        {label ? <div className="eyebrow">{label}</div> : null}
        {summary ? <p className="mt-1 text-sm text-[color:var(--color-muted)]">{summary}</p> : null}
      </div>
    ) : null}
    <div className="flex flex-1 flex-wrap items-end justify-end gap-3">{children}</div>
  </div>
);

type LabeledTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  helperText?: ReactNode;
  id: string;
  label: string;
};

export const LabeledTextInput = ({ helperText, id, label, ...inputProps }: LabeledTextInputProps) => {
  const helperId = helperText ? `${id}-hint` : undefined;

  return (
    <label className="min-w-44 text-sm" htmlFor={id}>
      <span className="metric-label">{label}</span>
      <input {...inputProps} aria-describedby={helperId} className="input mt-2" id={id} type="text" />
      {helperText ? (
        <span className="mt-1 block text-xs text-[color:var(--color-muted)]" id={helperId}>
          {helperText}
        </span>
      ) : null}
    </label>
  );
};

export interface LabeledSelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

type LabeledSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  helperText?: ReactNode;
  id: string;
  label: string;
  options: LabeledSelectOption[];
};

export const LabeledSelect = ({ helperText, id, label, options, ...selectProps }: LabeledSelectProps) => {
  const helperId = helperText ? `${id}-hint` : undefined;

  return (
    <label className="min-w-44 text-sm" htmlFor={id}>
      <span className="metric-label">{label}</span>
      <select {...selectProps} aria-describedby={helperId} className="input mt-2" id={id}>
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText ? (
        <span className="mt-1 block text-xs text-[color:var(--color-muted)]" id={helperId}>
          {helperText}
        </span>
      ) : null}
    </label>
  );
};

type ResetButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

export const ResetButton = ({ className = '', label = 'Reset filters', type = 'button', ...buttonProps }: ResetButtonProps) => (
  <button {...buttonProps} className={`btn btn-secondary ${className}`.trim()} type={type}>
    {label}
  </button>
);

export type SortDirection = 'ascending' | 'descending' | null;

export const sortDirectionToAriaSort = (direction: SortDirection) => direction ?? 'none';

const sortDirectionLabel = (direction: SortDirection) => {
  if (direction === 'ascending') {
    return 'ascending';
  }
  if (direction === 'descending') {
    return 'descending';
  }
  return 'not sorted';
};

export const SortableTableHeader = ({ direction = null, label, onSort }: { direction?: SortDirection; label: string; onSort: () => void }) => (
  <th aria-sort={sortDirectionToAriaSort(direction)} className="px-4 py-3" scope="col">
    <button
      aria-label={`Sort ${label} ${sortDirectionLabel(direction)}`}
      className="table-head inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left transition hover:bg-[var(--color-accent-soft)] hover:text-[color:var(--color-accent)]"
      onClick={onSort}
      type="button"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="font-[var(--font-display)] text-[color:var(--color-accent)]">
        {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}
      </span>
    </button>
  </th>
);


type MiniLineChartProps = {
  ariaLabel: string;
  density?: 'full' | 'compact';
  emptyLabel?: string;
  values: Array<number | null | undefined>;
};

type MiniLinePoint = {
  index: number;
  value: number;
  x: number;
  y: number;
};

const miniLineChartPoints = (values: Array<number | null | undefined>, width: number, height: number) => {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (numericValues.length < 2) {
    return [];
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min;
  const horizontalStep = values.length > 1 ? width / (values.length - 1) : width;
  const verticalPadding = 4;
  const usableHeight = height - verticalPadding * 2;

  return values.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const ratio = range === 0 ? 0.5 : (value - min) / range;
    return {
      index,
      value,
      x: Number((index * horizontalStep).toFixed(2)),
      y: Number((height - verticalPadding - ratio * usableHeight).toFixed(2))
    };
  });
};

const miniLineChartSegments = (points: Array<MiniLinePoint | null>) => {
  const segments: MiniLinePoint[][] = [];
  let currentSegment: MiniLinePoint[] = [];

  for (const point of points) {
    if (point === null) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    currentSegment.push(point);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
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

export const RightDrawer = ({
  ariaLabel,
  children,
  isOpen = true,
  onClose,
  title
}: {
  ariaLabel: string;
  children: ReactNode;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
}) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="right-drawer-backdrop">
      <aside aria-label={ariaLabel} aria-modal="true" className="right-drawer-shell" role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] p-5">
          <div>
            <div className="eyebrow">Details</div>
            <h2 className="mt-2 font-[var(--font-display)] text-3xl font-black leading-none tracking-[-0.08em]">{title}</h2>
          </div>
          <button aria-label="Close drawer" className="btn btn-secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </aside>
    </div>
  );
};
