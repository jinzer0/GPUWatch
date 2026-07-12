import { Button, DiagnosticPanel, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { formatTime, formatUnknown } from '../../lib/format';
import { DetailGpuCard } from './DetailGpuCard';
import { useServerDetailController } from './useServerDetailController';

const ServerHealthItem = ({ label, value }: { readonly label: string; readonly value: React.ReactNode }) => (
  <li className="surface min-w-0 p-4">
    <div className="metric-label">{label}</div>
    <div className="metric-value break-words">{value}</div>
  </li>
);

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
    <section className="detail-page space-y-6">
      <header className="detail-header border-b border-[color:var(--color-line)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">Detail</div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="break-words text-2xl font-semibold tracking-[-0.03em]">{detail.server.name}</h2>
              <StatusBadge status={detail.health.status} />
            </div>
            <p className="mt-3 break-words text-sm text-[color:var(--color-muted)]">{detail.server.username}@{detail.server.host}:{detail.server.port}</p>
          </div>
          <Button aria-label={`Refresh ${detail.server.name}`} disabled={controller.refreshMutation.isPending} onClick={() => controller.refreshMutation.mutate(detail.server.id)} type="button" variant="primary">
            Refresh {detail.server.name}
          </Button>
        </div>
        {hasRefreshDiagnostic ? (
          <section aria-label="Refresh diagnostic" className="mt-4" role="region">
            <DiagnosticPanel errorType={refreshResult.errorType} message={refreshResult.message} title="Refresh diagnostic" />
          </section>
        ) : null}
      </header>

      <ul aria-label="Server health" className="detail-health-strip grid grid-cols-5 gap-3" role="list">
        <ServerHealthItem label="Health" value={detail.health.status} />
        <ServerHealthItem label="Last successful poll" value={formatTime(detail.health.lastSuccessAt)} />
        <ServerHealthItem label="Snapshot received" value={formatTime(detail.receivedAt)} />
        <ServerHealthItem label="Driver / CUDA" value={`${formatUnknown(detail.driverVersion)} / ${formatUnknown(detail.cudaVersion)}`} />
        <ServerHealthItem label="Collector" value={formatUnknown(detail.collectorHostname)} />
      </ul>

      {hasHealthDiagnostic ? (
        <section aria-label="Health diagnostic" role="region">
          <DiagnosticPanel errorType={detail.health.lastErrorType} message={detail.health.lastErrorMessage} title="Health diagnostic" />
        </section>
      ) : null}

      {detail.warnings.length > 0 ? (
        <div className="surface p-4 text-sm text-[color:var(--color-stale)]">
          {detail.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="detail-gpus-heading" className="detail-gpus grid gap-4">
        <h3 className="section-title" id="detail-gpus-heading">
          GPUs
        </h3>
        {detail.gpus.map((gpu) => (
          <DetailGpuCard detail={detail} gpu={gpu} key={gpu.uuid} liveSamples={controller.liveSamples} storedHistory={controller.storedHistory} storedHistoryReady={controller.storedHistoryReady} />
        ))}
      </section>
    </section>
  );
};
