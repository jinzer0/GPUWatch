import { SortableTableHeader, StatusBadge } from '../../components/ui';
import { formatCommand, formatMiB, formatPercent, formatRuntimeSeconds, formatUnknown } from '../../lib/format';
import { pidCellSpacingClass, processRowKey, processStatus, type ProcessTableController } from './processTableModel';

const formatGpuUuidPreview = (gpuUuid: string) => (gpuUuid.length > 18 ? `${gpuUuid.slice(0, 15)}...` : gpuUuid);

export const ProcessRowsTable = ({ controller }: { readonly controller: ProcessTableController }) => (
  <div className="process-ledger-table-shell panel" role="region" aria-label="Process rows ledger">
    <table aria-label="Process rows ledger" className="process-ledger-table w-full text-left text-sm">
      <thead className="process-ledger-table-head table-head">
        <tr>
          <SortableTableHeader direction={controller.headerDirection('pid')} label="Process / PID" onSort={() => controller.handleSort('pid')} />
          <SortableTableHeader direction={controller.headerDirection('serverName')} label="Context / Server" onSort={() => controller.handleSort('serverName')} />
          <SortableTableHeader direction={controller.headerDirection('username')} label="User" onSort={() => controller.handleSort('username')} />
          <SortableTableHeader direction={controller.headerDirection('runtimeSeconds')} label="Runtime" onSort={() => controller.handleSort('runtimeSeconds')} />
          <SortableTableHeader direction={controller.headerDirection('gpuMemoryUsedMiB')} label="GPU memory" onSort={() => controller.handleSort('gpuMemoryUsedMiB')} />
          <SortableTableHeader direction={controller.headerDirection('gpuUtilizationPercent')} label="GPU util" onSort={() => controller.handleSort('gpuUtilizationPercent')} />
          <SortableTableHeader direction={controller.headerDirection('gpuIndex')} label="Context / GPU" onSort={() => controller.handleSort('gpuIndex')} />
          <SortableTableHeader direction={controller.headerDirection('gpuSmUtilizationPercent')} label="SM util" onSort={() => controller.handleSort('gpuSmUtilizationPercent')} />
          <SortableTableHeader direction={controller.headerDirection('gpuMemoryUtilizationPercent')} label="Memory util" onSort={() => controller.handleSort('gpuMemoryUtilizationPercent')} />
          <SortableTableHeader direction={controller.headerDirection('cpuPercent')} label="CPU" onSort={() => controller.handleSort('cpuPercent')} />
          <SortableTableHeader direction={controller.headerDirection('hostMemoryUsedMiB')} label="Host memory" onSort={() => controller.handleSort('hostMemoryUsedMiB')} />
          <SortableTableHeader direction={controller.headerDirection('command')} label="Command preview" onSort={() => controller.handleSort('command')} />
        </tr>
      </thead>
      <tbody>
        {controller.visibleProcessRows.map((item) => {
          switch (item.kind) {
            case 'section':
              return (
                <tr className="process-ledger-group-row" key={item.key}>
                  <td className="process-ledger-group-cell" colSpan={12}>
                    <div className="process-ledger-group-label table-head">
                      <span>{item.label}</span>
                      <span className="process-ledger-group-count">
                        {item.processCount} {item.processCount === 1 ? 'process' : 'processes'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            case 'process': {
              const { depth, row } = item;
              const commandPreview = formatCommand(row.command);
              const gpuUuidPreview = formatGpuUuidPreview(row.gpuUuid);
              const isSelected = controller.selectedProcess !== null && processRowKey(controller.selectedProcess) === processRowKey(row);
              return (
                <tr
                  aria-label={`Open process details for PID ${row.pid} on ${row.serverName}`}
                  aria-selected={isSelected ? true : undefined}
                  className={`process-ledger-row ${row.stale ? 'process-ledger-row-stale row-stale' : 'process-ledger-row-current'} ${isSelected ? 'process-ledger-row-selected' : ''}`}
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
                  <td className={`process-ledger-cell process-ledger-process-cell ${pidCellSpacingClass(depth)}`}>
                    <div className="process-ledger-process-cell-frame">
                      <div className="process-ledger-process-identity">
                        <div className="process-ledger-command-preview" title={commandPreview}>{commandPreview}</div>
                        <div className="process-ledger-process-meta">
                          <span className="font-[var(--font-display)]">PID {row.pid}</span>
                          {row.parentPid !== null && row.parentPid !== undefined ? <span>Parent PID {row.parentPid}</span> : null}
                        </div>
                      </div>
                      <StatusBadge status={processStatus(row)} />
                    </div>
                  </td>
                  <td className="process-ledger-cell process-ledger-context-cell">
                    <div className="process-ledger-server-name" title={row.serverName}>{row.serverName}</div>
                    <div className="process-ledger-gpu-uuid" title={row.gpuUuid}>
                      GPU {formatUnknown(row.gpuIndex)} · {gpuUuidPreview}
                    </div>
                  </td>
                  <td className="process-ledger-cell process-ledger-user-cell" title={formatUnknown(row.username)}>{formatUnknown(row.username)}</td>
                  <td className="process-ledger-cell process-ledger-metric-cell">{formatRuntimeSeconds(row.runtimeSeconds)}</td>
                  <td className="process-ledger-cell process-ledger-metric-cell process-ledger-memory-cell">{formatMiB(row.gpuMemoryUsedMiB)}</td>
                  <td className="process-ledger-cell process-ledger-metric-cell">{formatPercent(row.gpuUtilizationPercent)}</td>
                  <td className="process-ledger-cell process-ledger-gpu-cell" title={row.gpuUuid}>
                    GPU {formatUnknown(row.gpuIndex)}
                  </td>
                  <td className="process-ledger-cell process-ledger-metric-cell">{formatPercent(row.gpuSmUtilizationPercent)}</td>
                  <td className="process-ledger-cell process-ledger-metric-cell">{formatPercent(row.gpuMemoryUtilizationPercent)}</td>
                  <td className="process-ledger-cell process-ledger-metric-cell">{formatPercent(row.cpuPercent)}</td>
                  <td className="process-ledger-cell process-ledger-metric-cell">{formatMiB(row.hostMemoryUsedMiB)}</td>
                  <td className="process-ledger-cell process-ledger-command-cell" title={commandPreview}>
                    {commandPreview}
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
