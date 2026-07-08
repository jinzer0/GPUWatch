import type { ReactNode } from 'react';

import { RightDrawer, StatusBadge } from '../../components/ui';
import { formatCommand, formatMiB, formatPercent, formatRuntimeSeconds, formatUnknown } from '../../lib/format';
import type { ProcessRowDto } from '../../lib/types';
import { processStatus } from './processTableModel';

const ProcessDetailField = ({ children, label }: { readonly children: ReactNode; readonly label: string }) => (
  <div className="surface p-3">
    <dt className="metric-label">{label}</dt>
    <dd className="mt-2 break-words text-sm font-semibold text-[color:var(--color-text)]">{children}</dd>
  </div>
);

export const ProcessDetailDrawer = ({ onClose, row }: { readonly onClose: () => void; readonly row: ProcessRowDto }) => (
  <RightDrawer ariaLabel="Process details" onClose={onClose} title={`PID ${row.pid}`}>
    <div className="surface border-[color:var(--color-accent)] bg-[var(--color-accent-soft)] p-4 text-sm font-semibold text-[color:var(--color-accent)]">
      Read-only view; no process actions are available.
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <ProcessDetailField label="Server">{formatUnknown(row.serverName)}</ProcessDetailField>
      <ProcessDetailField label="Status">
        <StatusBadge status={processStatus(row)} />
      </ProcessDetailField>
      <ProcessDetailField label="GPU index">GPU {formatUnknown(row.gpuIndex)}</ProcessDetailField>
      <ProcessDetailField label="GPU UUID">{formatUnknown(row.gpuUuid)}</ProcessDetailField>
      <ProcessDetailField label="PID">{formatUnknown(row.pid)}</ProcessDetailField>
      <ProcessDetailField label="Parent PID">{formatUnknown(row.parentPid)}</ProcessDetailField>
      <ProcessDetailField label="Runtime">{formatRuntimeSeconds(row.runtimeSeconds)}</ProcessDetailField>
      <ProcessDetailField label="Username">{formatUnknown(row.username)}</ProcessDetailField>
      <ProcessDetailField label="Process kind">{formatUnknown(row.processKind)}</ProcessDetailField>
      <ProcessDetailField label="GPU memory">{formatMiB(row.gpuMemoryUsedMiB)}</ProcessDetailField>
      <ProcessDetailField label="GPU utilization">{formatPercent(row.gpuUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="SM util">{formatPercent(row.gpuSmUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="Memory util">{formatPercent(row.gpuMemoryUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="Encoder util">{formatPercent(row.gpuEncoderUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="Decoder util">{formatPercent(row.gpuDecoderUtilizationPercent)}</ProcessDetailField>
      <ProcessDetailField label="CPU">{formatPercent(row.cpuPercent)}</ProcessDetailField>
      <ProcessDetailField label="Host memory">{formatMiB(row.hostMemoryUsedMiB)}</ProcessDetailField>
      <div className="surface col-span-2 p-3">
        <dt className="metric-label">Command</dt>
        <dd className="mt-2 break-words font-mono text-sm leading-6 text-[color:var(--color-muted)]" title={formatCommand(row.command)}>
          {formatCommand(row.command)}
        </dd>
      </div>
    </dl>
  </RightDrawer>
);
