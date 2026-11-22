import { Button, DiagnosticPanel, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { formatTime, formatUnknown } from '../../lib/format';
import type { GpuCardDto, WatchRule } from '../../lib/types';
import { DetailGpuCard } from './DetailGpuCard';
import { getWatchTargetKey, useServerDetailController } from './useServerDetailController';
import type { ServerDetailController } from './useServerDetailController';

const ServerHealthItem = ({ label, value }: { readonly label: string; readonly value: React.ReactNode }) => (
  <li className="detail-health-item">
    <div className="metric-label">{label}</div>
    <div className="detail-health-value metric-value">{value}</div>
  </li>
);

const findGpuWatchRule = (rules: readonly WatchRule[], gpu: GpuCardDto) =>
  rules.find((rule) => rule.gpuUuid === gpu.uuid) ?? rules.find((rule) => rule.gpuUuid === null && rule.gpuIndex === gpu.index) ?? null;

const getErrorType = (error: Error | null) => {
  if (error && 'type' in error && typeof error.type === 'string') {
    return error.type;
  }
  return null;
};

const ConnectedServerDetailScreen = ({ selectedServerId }: { readonly selectedServerId: string | null }) => {
  const controller = useServerDetailController(selectedServerId);
  return <ServerDetailContent controller={controller} selectedServerId={selectedServerId} />;
};

export const ServerDetailScreen = ({ selectedServerId, controller }: {
  readonly selectedServerId: string | null;
  readonly controller?: ServerDetailController;
}) => controller
  ? <ServerDetailContent controller={controller} selectedServerId={selectedServerId} toolbarOwned />
  : <ConnectedServerDetailScreen selectedServerId={selectedServerId} />;

const ServerDetailContent = ({ selectedServerId, controller, toolbarOwned = false }: {
  readonly selectedServerId: string | null;
  readonly controller: ServerDetailController;
  readonly toolbarOwned?: boolean;
}) => {
  const detail = controller.detail;
  const refreshResult = controller.refreshResult;

  if (!selectedServerId) {
    return <EmptyState title="No server selected" body="Choose a server from the sidebar, or add a server using server management." />;
  }

  if (controller.detailQuery.isLoading) {
    return <LoadingState label="Loading server detail DTO..." />;
  }

  if (controller.detailQuery.error && !detail) {
    return <ErrorState message={controller.detailQuery.error.message} />;
  }

  if (!detail) {
    return <EmptyState title="Server not found" body="The selected server is no longer available in backend storage." />;
  }

  const hasHealthDiagnostic = detail.health.lastErrorType !== null || detail.health.lastErrorMessage !== null;
  const hasRefreshDiagnostic = refreshResult !== undefined && !refreshResult.ok;
  const watchError = controller.watchRulesQuery.error ?? controller.watchMutation.error;

  return (
    <section className="detail-page">
      <header className="detail-header">
        <div className="detail-server-identity">
          <div className="min-w-0">
            {toolbarOwned ? null : <div className="eyebrow">Detail</div>}
            <div className="flex items-center gap-3">
              {toolbarOwned ? null : <h2 className="break-words text-2xl font-semibold tracking-[-0.03em]">{detail.server.name}</h2>}
              <span className="detail-status-badge">
                <StatusBadge status={detail.health.status} />
              </span>
              <p className="detail-host">{detail.server.username}@{detail.server.host}:{detail.server.port}</p>
            </div>
          </div>
          {toolbarOwned ? null : <Button aria-label={`Refresh ${detail.server.name}`} className="detail-refresh-button" disabled={controller.refreshMutation.isPending} onClick={controller.refreshSelectedServer} type="button" variant="primary">
            <span className="detail-refresh-button-label">Refresh {detail.server.name}</span>
          </Button>}
        </div>
        {hasRefreshDiagnostic ? (
          <section aria-label="Refresh diagnostic" className="mt-4" role="region">
            <DiagnosticPanel errorType={refreshResult.errorType} message={refreshResult.message} title="Refresh diagnostic" />
          </section>
        ) : null}
        {controller.refreshError ? <section aria-label="Refresh diagnostic" className="mt-4" role="alert">
          <DiagnosticPanel errorType={getErrorType(controller.refreshError)} message={controller.refreshError.message} title="Refresh diagnostic" />
        </section> : null}
      </header>

      {controller.detailQuery.error ? (
        <section aria-label="Detail diagnostic" role="alert">
          <DiagnosticPanel errorType={getErrorType(controller.detailQuery.error)} message={controller.detailQuery.error.message} title="Detail diagnostic" />
          <p className="mt-3 text-sm text-[color:var(--color-muted)]">
            상세 정보를 다시 읽지 못했습니다. 마지막 성공 데이터를 표시하며 현재 GPU 가용 여부는 확인할 수 없습니다.
          </p>
        </section>
      ) : null}

      <ul aria-label="Server health" className="detail-health-strip grid gap-3" role="list">
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

      {watchError ? (
        <section aria-label="Watch diagnostic" role="region">
          <DiagnosticPanel errorType={getErrorType(watchError)} message={watchError.message} title="Watch diagnostic" />
        </section>
      ) : null}

      <section aria-labelledby="detail-gpus-heading" className="detail-gpus grid gap-4">
        <h3 className="section-title" id="detail-gpus-heading">
          GPUs
        </h3>
        {detail.gpus.map((gpu) => {
          const watchRule = findGpuWatchRule(controller.watchRules, gpu);
          const watchTarget = getWatchTargetKey(detail.server.id, watchRule ? watchRule.gpuUuid : gpu.uuid, gpu.index);
          const watchPending = controller.pendingWatchTargets.includes(watchTarget);

          return (
            <DetailGpuCard
              detail={detail}
              gpu={gpu}
              key={`${detail.server.id}:${gpu.uuid.trim() ? `uuid:${gpu.uuid}` : `index:${gpu.index}`}`}
              saveWatch={controller.saveWatch}
              watchPending={watchPending}
              watchRule={watchRule}
              watchRulesReady={controller.watchRulesQuery.isSuccess}
            />
          );
        })}
      </section>
    </section>
  );
};
