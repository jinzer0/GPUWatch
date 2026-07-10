import { DiagnosticPanel, EmptyState, ErrorState, LoadingState, MetricCard, StatusBadge } from '../../components/ui';
import { formatTime, formatUnknown, sanitizeMessage } from '../../lib/format';
import { DetailGpuCard } from './DetailGpuCard';
import { useServerDetailController } from './useServerDetailController';

export const ServerDetailScreen = ({ selectedServerId }: { readonly selectedServerId: string | null }) => {
  const controller = useServerDetailController(selectedServerId);
  const detail = controller.detail;
  const refreshResult = controller.refreshMutation.data;

  if (!selectedServerId) {
    return <EmptyState title="No server selected" body="Choose a server from Overview to inspect the latest backend detail DTO." />;
  }

  if (controller.detailQuery.isLoading) {
    return <LoadingState label="Loading server detail DTO..." />;
  }

  if (controller.detailQuery.error) {
    return <ErrorState message={controller.detailQuery.error.message} />;
  }

  if (!detail) {
    return <EmptyState title="Server not found" body="The selected server is no longer available in backend storage." />;
  }

  const hasHealthDiagnostic = detail.health.lastErrorType !== null || detail.health.lastErrorMessage !== null;
  const hasRefreshDiagnostic = refreshResult !== undefined && !refreshResult.ok;

  return (
    <section className="space-y-6">
      <div className="border-b border-[color:var(--color-line)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Server Detail</div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">{detail.server.name}</h2>
              <StatusBadge status={detail.health.status} />
            </div>
            <p className="mt-3 text-sm text-[color:var(--color-muted)]">{detail.server.username}@{detail.server.host}:{detail.server.port}</p>
          </div>
          <button className="btn btn-primary" disabled={controller.refreshMutation.isPending} onClick={() => controller.refreshMutation.mutate(detail.server.id)} type="button">
            Refresh server
          </button>
        </div>
        {hasRefreshDiagnostic ? <DiagnosticPanel className="mt-4" errorType={refreshResult.errorType} message={refreshResult.message} title="Refresh diagnostic" /> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Collector hostname" value={formatUnknown(detail.collectorHostname)} />
        <MetricCard label="Driver / CUDA" value={`${formatUnknown(detail.driverVersion)} / ${formatUnknown(detail.cudaVersion)}`} />
        <MetricCard label="Snapshot received" value={formatTime(detail.receivedAt)} />
        <MetricCard label="Last success" value={formatTime(detail.health.lastSuccessAt)} />
        <MetricCard label="Latest error type" value={formatUnknown(detail.health.lastErrorType)} />
        <MetricCard label="Latest error" value={sanitizeMessage(detail.health.lastErrorMessage)} />
      </div>

      {hasHealthDiagnostic ? <DiagnosticPanel errorType={detail.health.lastErrorType} message={detail.health.lastErrorMessage} title="Health diagnostic" /> : null}

      {detail.warnings.length > 0 ? (
        <div className="surface p-4 text-sm text-[color:var(--color-stale)]">
          {detail.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4">
        {detail.gpus.map((gpu) => (
          <DetailGpuCard detail={detail} gpu={gpu} key={gpu.uuid} liveSamples={controller.liveSamples} storedHistory={controller.storedHistory} storedHistoryReady={controller.storedHistoryReady} />
        ))}
      </div>
    </section>
  );
};
