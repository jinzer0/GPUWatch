import { SortableTableHeader, StatusBadge } from '../../components/ui';
import { formatCommand, formatMiB, formatPercent, formatRuntimeSeconds, formatUnknown } from '../../lib/format';
import { pidCellSpacingClass, processRowKey, type ProcessTableController } from './processTableModel';

export const ProcessRowsTable = ({ controller }: { readonly controller: ProcessTableController }) => (
  <div className="panel overflow-x-auto">
    <table className="w-full min-w-max text-left text-sm">
      <thead className="table-head bg-white/5">
        <tr>
          <SortableTableHeader direction={controller.headerDirection('serverName')} label="Server" onSort={() => controller.handleSort('serverName')} />
          <SortableTableHeader direction={controller.headerDirection('gpuIndex')} label="GPU" onSort={() => controller.handleSort('gpuIndex')} />
          <SortableTableHeader direction={controller.headerDirection('pid')} label="PID" onSort={() => controller.handleSort('pid')} />
          <SortableTableHeader direction={controller.headerDirection('runtimeSeconds')} label="Runtime" onSort={() => controller.handleSort('runtimeSeconds')} />
          <SortableTableHeader direction={controller.headerDirection('username')} label="User" onSort={() => controller.handleSort('username')} />
          <SortableTableHeader direction={controller.headerDirection('gpuMemoryUsedMiB')} label="GPU memory" onSort={() => controller.handleSort('gpuMemoryUsedMiB')} />
          <SortableTableHeader direction={controller.headerDirection('gpuUtilizationPercent')} label="GPU util" onSort={() => controller.handleSort('gpuUtilizationPercent')} />
          <SortableTableHeader direction={controller.headerDirection('gpuSmUtilizationPercent')} label="SM util" onSort={() => controller.handleSort('gpuSmUtilizationPercent')} />
          <SortableTableHeader direction={controller.headerDirection('gpuMemoryUtilizationPercent')} label="Memory util" onSort={() => controller.handleSort('gpuMemoryUtilizationPercent')} />
          <SortableTableHeader direction={controller.headerDirection('cpuPercent')} label="CPU" onSort={() => controller.handleSort('cpuPercent')} />
          <SortableTableHeader direction={controller.headerDirection('hostMemoryUsedMiB')} label="Host memory" onSort={() => controller.handleSort('hostMemoryUsedMiB')} />
          <SortableTableHeader direction={controller.headerDirection('command')} label="Command" onSort={() => controller.handleSort('command')} />
        </tr>
      </thead>
      <tbody>
        {controller.visibleProcessRows.map((item) => {
          switch (item.kind) {
            case 'section':
              return (
                <tr className="border-t border-[color:var(--color-border)] bg-white/5" key={item.key}>
                  <td className="px-4 py-3" colSpan={12}>
                    <div className="table-head flex items-center gap-3 text-[color:var(--color-accent)]">
                      <span>{item.label}</span>
                      <span className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-[color:var(--color-muted)]">
                        {item.processCount} {item.processCount === 1 ? 'process' : 'processes'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            case 'process': {
              const { depth, row } = item;
              return (
                <tr
                  aria-label={`Open process details for PID ${row.pid} on ${row.serverName}`}
                  className={`cursor-pointer border-t border-[color:var(--color-border)] outline-none transition hover:bg-[var(--color-accent-soft)] focus-visible:bg-[var(--color-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${row.stale ? 'row-stale' : 'bg-transparent'}`}
                  key={processRowKey(row)}
                  onClick={() => controller.openProcessDetails(row)}
                  onKeyDown={(event) => controller.handleRowKeyDown(event, row)}
                  ref={(element) => {
                    const key = processRowKey(row);
                    if (element) {
                      controller.rowRefs.current.set(key, element);
                      return;
                    }
                    controller.rowRefs.current.delete(key);
                  }}
                  tabIndex={0}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.serverName}</div>
                    {row.stale ? <StatusBadge status="stale" /> : null}
                  </td>
                  <td className="px-4 py-3 font-[var(--font-display)]">{row.gpuIndex}</td>
                  <td className={pidCellSpacingClass(depth)}>
                    <div className="font-[var(--font-display)]">{row.pid}</div>
                    {row.parentPid !== null && row.parentPid !== undefined ? <div className="mt-1 text-xs text-[color:var(--color-muted)]">Parent PID {row.parentPid}</div> : null}
                  </td>
                  <td className="px-4 py-3">{formatRuntimeSeconds(row.runtimeSeconds)}</td>
                  <td className="px-4 py-3">{formatUnknown(row.username)}</td>
                  <td className="px-4 py-3 font-semibold text-[color:var(--color-accent)]">{formatMiB(row.gpuMemoryUsedMiB)}</td>
                  <td className="px-4 py-3">{formatPercent(row.gpuUtilizationPercent)}</td>
                  <td className="px-4 py-3">{formatPercent(row.gpuSmUtilizationPercent)}</td>
                  <td className="px-4 py-3">{formatPercent(row.gpuMemoryUtilizationPercent)}</td>
                  <td className="px-4 py-3">{formatPercent(row.cpuPercent)}</td>
                  <td className="px-4 py-3">{formatMiB(row.hostMemoryUsedMiB)}</td>
                  <td className="max-w-sm truncate px-4 py-3 text-[color:var(--color-muted)]" title={formatCommand(row.command)}>
                    {formatCommand(row.command)}
                  </td>
                </tr>
              );
            }
          }
        })}
      </tbody>
    </table>
  </div>
);
