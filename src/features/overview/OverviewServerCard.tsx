import { DiagnosticPanel, MetricCard, ResultFeedback, StatusBadge } from '../../components/ui';
import { formatPercent, formatTemperature, formatTime, formatUnknown, sanitizeMessage } from '../../lib/format';
import type { ServerOverviewDto } from '../../lib/types';
import type { useOverviewController } from './useOverviewController';

export const OverviewServerCard = ({
  controller,
  server
}: {
  readonly controller: ReturnType<typeof useOverviewController>;
  readonly server: ServerOverviewDto;
}) => {
  const isRefreshingRow = controller.refreshMutation.isPending && controller.refreshMutation.variables === server.id;
  const hasLatestDiagnostic = server.lastErrorType !== null || server.lastErrorMessage !== null;

  return (
    <article aria-label={`${server.name} overview`} className="panel overflow-hidden p-5" key={server.id}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <button className="text-left" onClick={() => controller.openServer(server.id)} type="button">
          <div className="flex items-center gap-3">
            <h3 className="font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{server.name}</h3>
            <StatusBadge status={server.status} />
          </div>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">{server.host}</p>
        </button>
        <button className="btn btn-secondary" disabled={isRefreshingRow} onClick={() => controller.refreshMutation.mutate(server.id)} type="button">
          Refresh
        </button>
      </div>

      {controller.refreshFeedback?.serverId === server.id ? (
        <div className="mt-4">
          <ResultFeedback {...controller.refreshFeedback} />
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-4 gap-3">
        <MetricCard label="GPU total" value={server.gpuTotal} tone="accent" />
        <MetricCard label="Busy / free" value={`${server.busyGpuCount} / ${server.freeGpuCount}`} />
        <MetricCard label="Average GPU util" value={formatPercent(server.averageGpuUtilizationPercent)} />
        <MetricCard label="Average memory" value={formatPercent(server.averageMemoryUsagePercent)} />
        <MetricCard label="Max temperature" value={formatTemperature(server.maxTemperatureCelsius)} />
        <MetricCard label="Last success" value={formatTime(server.lastSuccessAt)} />
        <MetricCard label="Error type" value={formatUnknown(server.lastErrorType)} />
        <MetricCard label="Error message" value={sanitizeMessage(server.lastErrorMessage)} />
      </div>

      {hasLatestDiagnostic ? <DiagnosticPanel className="mt-4" errorType={server.lastErrorType} message={server.lastErrorMessage} title="Latest diagnostic" /> : null}
    </article>
  );
};
