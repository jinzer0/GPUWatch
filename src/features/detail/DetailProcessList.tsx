import { formatMiB, formatUnknown, sanitizeMessage } from '../../lib/format';
import type { CollectorProcess } from '../../lib/types';

export const DetailProcessList = ({ processes }: { readonly processes: readonly CollectorProcess[] }) => {
  if (processes.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">No active GPU processes for this snapshot.</p>;
  }

  return (
    <div className="detail-process-table-shell overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
      <table aria-label="GPU processes" className="detail-process-table w-full text-sm">
        <thead className="bg-white/5 text-left table-head">
          <tr>
            <th className="px-3 py-2" scope="col">PID</th>
            <th className="px-3 py-2" scope="col">User</th>
            <th className="px-3 py-2" scope="col">GPU memory</th>
            <th className="px-3 py-2" scope="col">Command</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => {
            const command = sanitizeMessage(process.command);

            return (
              <tr className="border-t border-[color:var(--color-border)]" key={`${process.pid}-${process.gpuMemoryUsedMiB ?? 'unknown'}`}>
                <td className="px-3 py-2 font-[var(--font-display)]">{process.pid}</td>
                <td className="px-3 py-2">{formatUnknown(process.username)}</td>
                <td className="px-3 py-2">{formatMiB(process.gpuMemoryUsedMiB)}</td>
                <td className="min-w-72 break-words px-3 py-2 text-[color:var(--color-muted)]" title={command}>
                  {command}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
