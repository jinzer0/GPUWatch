import type { ReactNode } from 'react';

import { formatUnknown, sanitizeMessage } from '../../lib/format';

const statusClasses = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('online') || normalized.includes('success')) {
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

export const StatusBadge = ({ status }: { readonly status: string }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(status)}`}>
    {formatUnknown(status)}
  </span>
);

export const MetricCard = ({ label, value, tone }: { readonly label: string; readonly value: ReactNode; readonly tone?: 'accent' }) => (
  <div className="surface p-4">
    <div className="metric-label">{label}</div>
    <div className={tone === 'accent' ? 'metric-value text-[color:var(--color-accent)]' : 'metric-value'}>{value}</div>
  </div>
);

export const EmptyState = ({ title, body }: { readonly title: string; readonly body: string }) => (
  <div className="surface flex min-h-48 flex-col items-center justify-center p-8 text-center">
    <div className="section-title">{title}</div>
    <p className="mt-3 max-w-lg text-sm text-[color:var(--color-muted)]">{body}</p>
  </div>
);

export const ErrorState = ({ message }: { readonly message: string }) => (
  <div className="surface border-[color:var(--color-error)] p-4 text-sm text-[color:var(--color-error)]">{message}</div>
);

export const LoadingState = ({ label }: { readonly label: string }) => (
  <div className="surface p-6 text-sm text-[color:var(--color-muted)]">{label}</div>
);

type ResultFeedbackProps =
  | {
      readonly label: string;
      readonly state: 'pending';
    }
  | {
      readonly label?: string;
      readonly message: string;
      readonly state: 'error' | 'success';
    };

export const ResultFeedback = (props: ResultFeedbackProps) => {
  switch (props.state) {
    case 'pending':
      return (
        <div aria-label={props.label} aria-live="polite" role="status">
          <LoadingState label={`${props.label} pending`} />
        </div>
      );
    case 'success':
      return (
        <div aria-label={props.label ?? 'success result'} aria-live="polite" className="surface p-4 text-sm" role="status">
          <div className="mb-2">
            <StatusBadge status="success" />
          </div>
          <div>{sanitizeMessage(props.message)}</div>
        </div>
      );
    case 'error':
      return (
        <div aria-label={props.label ?? 'error result'} className="surface p-4 text-sm" role="alert">
          <div className="mb-2">
            <StatusBadge status="error" />
          </div>
          <ErrorState message={sanitizeMessage(props.message)} />
        </div>
      );
  }
};
