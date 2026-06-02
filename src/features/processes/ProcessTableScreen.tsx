import { useQuery } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { listProcesses, queryKeys } from '../../lib/api';
import { formatCommand, formatMiB, formatPercent, formatUnknown } from '../../lib/format';

export const ProcessTableScreen = () => {
  const processesQuery = useQuery({ queryKey: queryKeys.processes, queryFn: listProcesses });
  const rows = [...(processesQuery.data ?? [])].sort(
    (left, right) => (right.gpuMemoryUsedMiB ?? -1) - (left.gpuMemoryUsedMiB ?? -1)
  );

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="eyebrow">Process Table</div>
        <h2 className="mt-2 font-[var(--font-display)] text-4xl font-black tracking-[-0.08em]">GPU memory ledger</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
          Flattened backend process rows, default sorted by GPU memory descending with stale snapshot rows visibly marked.
        </p>
      </div>

      {processesQuery.isLoading ? (
        <LoadingState label="Loading process DTO rows..." />
      ) : processesQuery.error ? (
        <ErrorState message={processesQuery.error.message} />
      ) : rows.length === 0 ? (
        <EmptyState title="No processes" body="No latest successful GPU process rows are currently available." />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="table-head bg-white/5">
              <tr>
                <th className="px-4 py-3">Server</th>
                <th className="px-4 py-3">GPU</th>
                <th className="px-4 py-3">PID</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">GPU memory</th>
                <th className="px-4 py-3">GPU util</th>
                <th className="px-4 py-3">CPU</th>
                <th className="px-4 py-3">Host memory</th>
                <th className="px-4 py-3">Command</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className={`border-t border-[color:var(--color-border)] ${row.stale ? 'row-stale' : 'bg-transparent'}`}
                  key={`${row.serverId}-${row.gpuIndex}-${row.pid}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.serverName}</div>
                    {row.stale ? <StatusBadge status="stale" /> : null}
                  </td>
                  <td className="px-4 py-3 font-[var(--font-display)]">{row.gpuIndex}</td>
                  <td className="px-4 py-3 font-[var(--font-display)]">{row.pid}</td>
                  <td className="px-4 py-3">{formatUnknown(row.username)}</td>
                  <td className="px-4 py-3 font-semibold text-[color:var(--color-accent)]">{formatMiB(row.gpuMemoryUsedMiB)}</td>
                  <td className="px-4 py-3">{formatPercent(row.gpuUtilizationPercent)}</td>
                  <td className="px-4 py-3">{formatPercent(row.cpuPercent)}</td>
                  <td className="px-4 py-3">{formatMiB(row.hostMemoryUsedMiB)}</td>
                  <td className="max-w-sm truncate px-4 py-3 text-[color:var(--color-muted)]" title={formatCommand(row.command)}>
                    {formatCommand(row.command)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
