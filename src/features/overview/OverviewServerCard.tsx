import { Button, DiagnosticPanel, ResultFeedback, StatusBadge } from '../../components/ui';
import { formatPercent, formatTemperature, formatTime } from '../../lib/format';
import type { ServerOverviewDto } from '../../lib/types';
import { overviewGpuActivityKnown, overviewNeedsAttention } from './overviewModel';
import type { useOverviewController } from './useOverviewController';

const formatGpuCount = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value.toString() : 'unknown');

export const OverviewServerCard = ({
  controller,
  server
}: {
  readonly controller: ReturnType<typeof useOverviewController>;
  readonly server: ServerOverviewDto;
}) => {
  const isRefreshingRow = controller.refreshMutation.isPending && controller.refreshMutation.variables === server.id;
  const hasLatestDiagnostic = server.lastErrorType !== null || server.lastErrorMessage !== null;
  const gpuActivityKnown = overviewGpuActivityKnown(server);
  const needsAttention = overviewNeedsAttention(server);

  return (
    <article aria-label={`${server.name} overview`} className="overview-server-row">
      <div className="overview-server-header">
        <button className="overview-server-identity" onClick={() => controller.openServer(server.id)} type="button">
          <span className="overview-server-name">{server.name}</span>
          <span className="overview-server-host">{server.host}</span>
          <span className="overview-server-last-success">Last successful poll {formatTime(server.lastSuccessAt)}</span>
        </button>
        <StatusBadge status={server.status} />
        <Button aria-label={`Refresh ${server.name}`} disabled={isRefreshingRow} onClick={() => controller.refreshMutation.mutate(server.id)} type="button" variant="secondary">
          Refresh
        </Button>
      </div>

      <div className="overview-server-activity" aria-label={`${server.name} GPU activity`}>
        <div>
          <span className="metric-label">GPU activity</span>
          <strong>{gpuActivityKnown ? `${formatGpuCount(server.busyGpuCount)} busy / ${formatGpuCount(server.freeGpuCount)} free` : 'unknown'}</strong>
          <span>{gpuActivityKnown ? `${formatGpuCount(server.gpuTotal)} total GPUs reported` : 'No current GPU count in overview DTO'}</span>
        </div>
        <div>
          <span className="metric-label">Processes</span>
          <strong>unknown</strong>
          <span>Process activity is unavailable from overview DTO</span>
        </div>
        <div>
          <span className="metric-label">Attention</span>
          <strong className={needsAttention ? 'overview-server-attention-warning' : 'overview-server-attention-clear'}>{needsAttention ? 'Review needed' : 'Clear'}</strong>
          <span>{hasLatestDiagnostic ? 'Latest diagnostic available' : `Status ${server.status}`}</span>
        </div>
      </div>

      {controller.refreshFeedback?.serverId === server.id ? (
        <div className="overview-server-feedback">
          <ResultFeedback {...controller.refreshFeedback} />
        </div>
      ) : null}

      <dl className="overview-server-metrics">
        <div className="overview-server-metric">
          <dt className="metric-label">GPU total</dt>
          <dd className="metric-value text-[color:var(--color-accent)]">{formatGpuCount(server.gpuTotal)}</dd>
        </div>
        <div className="overview-server-metric">
          <dt className="metric-label">Busy / free</dt>
          <dd className="metric-value">{formatGpuCount(server.busyGpuCount)} / {formatGpuCount(server.freeGpuCount)}</dd>
        </div>
        <div className="overview-server-metric">
          <dt className="metric-label">Average GPU util</dt>
          <dd className="metric-value">{formatPercent(server.averageGpuUtilizationPercent)}</dd>
        </div>
        <div className="overview-server-metric">
          <dt className="metric-label">Average memory</dt>
          <dd className="metric-value">{formatPercent(server.averageMemoryUsagePercent)}</dd>
        </div>
        <div className="overview-server-metric">
          <dt className="metric-label">Max temperature</dt>
          <dd className="metric-value">{formatTemperature(server.maxTemperatureCelsius)}</dd>
        </div>
      </dl>

      {hasLatestDiagnostic ? <DiagnosticPanel className="overview-server-diagnostic" errorType={server.lastErrorType} message={server.lastErrorMessage} title="Latest diagnostic" /> : null}
    </article>
  );
};
