import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { sanitizeMessage } from '../../lib/format';
import type { ServerOverviewDto } from '../../lib/types';
import { HistoryCharts } from './HistoryCharts';
import { HistoryControls, HistoryMetricToggles } from './HistoryControls';
import { useHistoryMonitorController } from './useHistoryMonitorController';

const HistoryIdentityPanel = () => (
  <header className="border-b border-[color:var(--color-line)] pb-5">
    <div className="eyebrow">Live Monitor</div>
    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Stored GPU history</h2>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">Successful poll samples only; gaps mean no stored sample.</p>
  </header>
);

export const HistoryMonitorScreen = ({ overview, selectedServerId }: { readonly overview: ServerOverviewDto[]; readonly selectedServerId: string | null }) => {
  const controller = useHistoryMonitorController({ overview, selectedServerId });

  if (overview.length === 0) {
    return (
      <section className="space-y-6">
        <HistoryIdentityPanel />
        <EmptyState title="No servers available" body="Add or seed a server before opening stored GPU history." />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <HistoryIdentityPanel />
      <HistoryControls controller={controller} />
      <HistoryMetricToggles selectedMetrics={controller.selectedMetrics} toggleMetric={controller.toggleMetric} />

      {!controller.hasConcreteServer ? <EmptyState title="No server selected" body="Choose a server before loading stored GPU history." /> : null}
      {controller.historyQuery.isLoading ? <LoadingState label="Loading stored GPU history..." /> : null}
      {controller.historyQuery.error ? <ErrorState message={sanitizeMessage(controller.historyQuery.error.message)} /> : null}
      {!controller.historyQuery.isLoading && !controller.historyQuery.error && controller.hasConcreteServer && controller.history && (!controller.hasHistorySeries || !controller.hasAnySamples) ? (
        <EmptyState title="No stored GPU history" body="Only successful poll samples are stored. Empty history means this server has no successful samples in the selected range." />
      ) : null}
      {!controller.historyQuery.isLoading && !controller.historyQuery.error && controller.history && controller.hasHistorySeries && controller.hasAnySamples && controller.selectedMetrics.length === 0 ? (
        <EmptyState title="No metrics selected" body="Turn on one or more metrics to render stored GPU history charts." />
      ) : null}
      {!controller.historyQuery.isLoading && !controller.historyQuery.error && controller.history && controller.hasHistorySeries && controller.hasAnySamples && controller.selectedMetrics.length > 0 ? (
        <HistoryCharts history={controller.history} selectedMetrics={controller.selectedMetrics} visibleSeries={controller.visibleSeries} />
      ) : null}
    </section>
  );
};
