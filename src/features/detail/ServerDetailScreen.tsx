import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, MetricCard, StatusBadge } from '../../components/ui';
import { getServerDetail, queryKeys, refreshServer } from '../../lib/api';
import { formatCommand, formatMiB, formatPercent, formatTemperature, formatTime, formatUnknown, formatWatts, sanitizeMessage } from '../../lib/format';
import type { CollectorProcess } from '../../lib/types';

const ProcessList = ({ processes }: { processes: CollectorProcess[] }) => {
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

export const ServerDetailScreen = ({ selectedServerId }: { selectedServerId: string | null }) => {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: selectedServerId ? queryKeys.detail(selectedServerId) : ['server-detail', 'none'],
    queryFn: () => getServerDetail(selectedServerId ?? ''),
    enabled: selectedServerId !== null
  });
  const refreshMutation = useMutation({
    mutationFn: refreshServer,
    onSuccess: (_result, id) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.processes })
      ])
  });

  if (!selectedServerId) {
    return <EmptyState title="No server selected" body="Choose a server from Overview to inspect the latest backend detail DTO." />;
  }

  if (detailQuery.isLoading) {
    return <LoadingState label="Loading server detail DTO..." />;
  }

  if (detailQuery.error) {
    return <ErrorState message={detailQuery.error.message} />;
  }

  const detail = detailQuery.data;
  if (!detail) {
    return <EmptyState title="Server not found" body="The selected server is no longer available in backend storage." />;
  }

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Server Detail</div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="font-[var(--font-display)] text-4xl font-black tracking-[-0.08em]">{detail.server.name}</h2>
              <StatusBadge status={detail.health.status} />
            </div>
            <p className="mt-3 text-sm text-[color:var(--color-muted)]">
              {detail.server.username}@{detail.server.host}:{detail.server.port}
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate(detail.server.id)}
            type="button"
          >
            Refresh server
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Collector hostname" value={formatUnknown(detail.collectorHostname)} />
        <MetricCard label="Driver / CUDA" value={`${formatUnknown(detail.driverVersion)} / ${formatUnknown(detail.cudaVersion)}`} />
        <MetricCard label="Snapshot received" value={formatTime(detail.receivedAt)} />
        <MetricCard label="Last success" value={formatTime(detail.health.lastSuccessAt)} />
        <MetricCard label="Latest error" value={sanitizeMessage(detail.health.lastErrorMessage)} />
      </div>

      {detail.warnings.length > 0 ? (
        <div className="surface p-4 text-sm text-[color:var(--color-stale)]">
          {detail.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4">
        {detail.gpus.map((gpu) => (
          <article className="panel p-5" key={gpu.uuid}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow">GPU {gpu.index}</div>
                <h3 className="mt-1 font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{gpu.name}</h3>
                <p className="mt-1 text-xs text-[color:var(--color-muted)]">{gpu.uuid}</p>
              </div>
              <StatusBadge status={gpu.busy ? 'busy' : 'free'} />
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              <MetricCard label="Memory used" value={`${formatMiB(gpu.memoryUsedMiB)} / ${formatMiB(gpu.memoryTotalMiB)}`} />
              <MetricCard label="Memory free" value={formatMiB(gpu.memoryFreeMiB)} />
              <MetricCard label="GPU util" value={formatPercent(gpu.gpuUtilizationPercent)} />
              <MetricCard label="Memory util" value={formatPercent(gpu.memoryUtilizationPercent)} />
              <MetricCard label="Temperature" value={formatTemperature(gpu.temperatureCelsius)} />
              <MetricCard label="Power" value={`${formatWatts(gpu.powerDrawWatt)} / ${formatWatts(gpu.powerLimitWatt)}`} />
              <MetricCard label="Fan" value={formatPercent(gpu.fanSpeedPercent)} />
              <MetricCard label="Processes" value={gpu.processCount} />
            </div>
            <div className="mt-5">
              <ProcessList processes={gpu.processes} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
