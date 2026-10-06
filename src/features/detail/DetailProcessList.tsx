import { formatMiB, formatUnknown } from '../../lib/format';
import type { CollectorProcess } from '../../lib/types';

export const DetailProcessList = ({ processes, unavailable = false }: {
  readonly processes: readonly CollectorProcess[];
  readonly unavailable?: boolean;
}) => {
  if (processes.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        {unavailable ? 'GPU 프로세스 정보를 수집할 수 없습니다.' : '실행 중인 GPU 프로세스가 없습니다.'}
      </p>
    );
  }

  return (
    <>
      {unavailable && (
        <p role="status" className="text-sm text-[color:var(--color-muted)]">
          GPU 프로세스 정보가 일부만 수집되었습니다. 수집된 프로세스를 표시합니다.
        </p>
      )}
      <div
        aria-label="GPU 프로세스 목록"
        className="detail-process-table-shell overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]"
        role="region"
        tabIndex={0}
      >
      <table aria-label="GPU 프로세스" className="detail-process-table w-full text-sm">
        <thead className="bg-white/5 text-left table-head">
          <tr>
            <th className="px-3 py-2" scope="col">PID</th>
            <th className="px-3 py-2" scope="col">사용자</th>
            <th className="px-3 py-2" scope="col">명령어</th>
            <th className="px-3 py-2" scope="col">VRAM</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => {
            const command = formatUnknown(process.command);

            return (
              <tr className="border-t border-[color:var(--color-border)]" key={`${process.pid}-${process.gpuMemoryUsedMiB ?? 'unknown'}`}>
                <td className="px-3 py-2 font-[var(--font-display)]">{process.pid}</td>
                <td className="px-3 py-2">{formatUnknown(process.username)}</td>
                <td className="min-w-72 whitespace-pre-wrap break-words px-3 py-2 text-[color:var(--color-muted)]" title={command}>
                  {command}
                </td>
                <td className="px-3 py-2">{formatMiB(process.gpuMemoryUsedMiB)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
};
