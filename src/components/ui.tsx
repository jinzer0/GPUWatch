import type { ReactNode } from 'react';

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
