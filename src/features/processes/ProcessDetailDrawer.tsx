import type { ReactNode } from 'react';

import { RightDrawer, StatusBadge } from '../../components/ui';
import { formatDrawerCommand, formatMiB, formatPercent, formatRuntimeSeconds, formatUnknown } from '../../lib/format';
import type { ProcessRowDto } from '../../lib/types';
import { processStatus } from './processTableModel';

const ProcessDetailRow = ({ children, label }: { readonly children: ReactNode; readonly label: string }) => (
  <div className="process-detail-row grid gap-2 border-b border-[color:var(--color-line)] py-2 last:border-b-0 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <dt className="metric-label">{label}</dt>
    <dd className="process-detail-value text-sm font-semibold leading-6 text-[color:var(--color-text)]">{children}</dd>
  </div>
);

const ProcessDetailSection = ({ children, title }: { readonly children: ReactNode; readonly title: string }) => (
  <section className="process-detail-section border-t border-[color:var(--color-line)] px-4 py-3" aria-labelledby={`process-detail-${title.toLowerCase().replace(/\s+/g, '-')}`}>
    <h3 className="eyebrow" id={`process-detail-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</h3>
    <dl className="mt-2">{children}</dl>
  </section>
);

export const ProcessDetailDrawer = ({ onClose, row }: { readonly onClose: () => void; readonly row: ProcessRowDto }) => (
  <RightDrawer ariaLabel="Process details" autoFocusCloseButton onClose={onClose} title={`PID ${row.pid}`}>
    <article className="process-detail-inspector surface-raised overflow-hidden">
      <header className="process-detail-identity bg-[var(--color-surface)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="metric-label">Process identity</p>
            <p className="mt-1 break-words font-[var(--font-display)] text-2xl font-black leading-none tracking-[-0.06em] text-[color:var(--color-text)]">
              {formatUnknown(row.serverName)} / GPU {formatUnknown(row.gpuIndex)}
            </p>
          </div>
          <StatusBadge status={processStatus(row)} />
        </div>
      </header>

      <ProcessDetailSection title="Runtime">
        <ProcessDetailRow label="PID">{formatUnknown(row.pid)}</ProcessDetailRow>
        <ProcessDetailRow label="Parent PID">{formatUnknown(row.parentPid)}</ProcessDetailRow>
        <ProcessDetailRow label="Runtime">{formatRuntimeSeconds(row.runtimeSeconds)}</ProcessDetailRow>
        <ProcessDetailRow label="Username">{formatUnknown(row.username)}</ProcessDetailRow>
        <ProcessDetailRow label="Process kind">{formatUnknown(row.processKind)}</ProcessDetailRow>
      </ProcessDetailSection>

      <ProcessDetailSection title="GPU metrics">
        <ProcessDetailRow label="GPU UUID">{formatUnknown(row.gpuUuid)}</ProcessDetailRow>
        <ProcessDetailRow label="GPU memory">{formatMiB(row.gpuMemoryUsedMiB)}</ProcessDetailRow>
        <ProcessDetailRow label="GPU utilization">{formatPercent(row.gpuUtilizationPercent)}</ProcessDetailRow>
        <ProcessDetailRow label="SM util">{formatPercent(row.gpuSmUtilizationPercent)}</ProcessDetailRow>
        <ProcessDetailRow label="Memory util">{formatPercent(row.gpuMemoryUtilizationPercent)}</ProcessDetailRow>
        <ProcessDetailRow label="Encoder util">{formatPercent(row.gpuEncoderUtilizationPercent)}</ProcessDetailRow>
        <ProcessDetailRow label="Decoder util">{formatPercent(row.gpuDecoderUtilizationPercent)}</ProcessDetailRow>
      </ProcessDetailSection>

      <ProcessDetailSection title="Host metrics">
        <ProcessDetailRow label="CPU">{formatPercent(row.cpuPercent)}</ProcessDetailRow>
        <ProcessDetailRow label="Host memory">{formatMiB(row.hostMemoryUsedMiB)}</ProcessDetailRow>
      </ProcessDetailSection>

      <section className="process-detail-command border-t border-[color:var(--color-line)] px-4 py-3" aria-labelledby="process-detail-command">
        <h3 className="eyebrow" id="process-detail-command">Full command</h3>
        <pre aria-label="Full command" className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-card)] border border-[color:var(--color-line)] bg-[var(--color-canvas-deep)] p-3 font-mono text-xs leading-6 text-[color:var(--color-muted)]">
          {formatDrawerCommand(row.command)}
        </pre>
      </section>

      <footer className="process-detail-readonly-note border-t border-[color:var(--color-line)] bg-[var(--color-accent-soft)] px-4 py-3 text-xs font-semibold leading-5 text-[color:var(--color-accent)]">
        Read-only view; no process actions are available.
      </footer>
    </article>
  </RightDrawer>
);
