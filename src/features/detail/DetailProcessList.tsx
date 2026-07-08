import { formatCommand, formatMiB, formatUnknown } from '../../lib/format';
import type { CollectorProcess } from '../../lib/types';

export const DetailProcessList = ({ processes }: { readonly processes: readonly CollectorProcess[] }) => {
  if (processes.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">No GPU processes reported.</p>;
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left table-head">
          <tr>
            <th className="px-3 py-2">PID</th>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">GPU memory</th>
            <th className="px-3 py-2">Command</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr className="border-t border-[color:var(--color-border)]" key={`${process.pid}-${process.gpuMemoryUsedMiB ?? 'unknown'}`}>
              <td className="px-3 py-2 font-[var(--font-display)]">{process.pid}</td>
              <td className="px-3 py-2">{formatUnknown(process.username)}</td>
              <td className="px-3 py-2">{formatMiB(process.gpuMemoryUsedMiB)}</td>
              <td className="px-3 py-2 text-[color:var(--color-muted)]" title={formatCommand(process.command)}>
                {formatCommand(process.command)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
