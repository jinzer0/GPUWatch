import { Button, InlineToolbar, LabeledSelect, ResultFeedback } from '../../components/ui';
import { ALL_HISTORY_GPU_VALUE, HISTORY_RANGES, historyMetricDefinitions, parseHistoryRange, rangeLabel, type HistoryMetricId } from './historyModel';
import type { useHistoryMonitorController } from './useHistoryMonitorController';

type HistoryController = ReturnType<typeof useHistoryMonitorController>;

export const HistoryControls = ({ controller }: { readonly controller: HistoryController }) => (
  <div className="history-monitor-controls" role="group" aria-label="History monitor controls">
    <InlineToolbar
      label="History controls"
      summary={
        controller.activeServer
          ? `${controller.activeServer.name} / ${rangeLabel(controller.range)} / ${controller.visibleSeries.length} GPU series. Null metrics and missing poll intervals render as gaps, not zeroes.`
          : 'Select a server to load stored GPU history.'
      }
    >
      <LabeledSelect
        id="history-server"
        label="Server"
        onChange={(event) => {
          controller.setActiveServerId(event.target.value);
          controller.setSelectedGpu(ALL_HISTORY_GPU_VALUE);
        }}
        options={controller.serverOptions}
        value={controller.activeServerId ?? ''}
      />
      <LabeledSelect id="history-gpu" label="GPU" onChange={(event) => controller.setSelectedGpu(event.target.value)} options={controller.gpuOptions} value={controller.selectedGpu} />
      <LabeledSelect
        id="history-range"
        label="Range"
        onChange={(event) => controller.setRange(parseHistoryRange(event.target.value))}
        options={HISTORY_RANGES.map((historyRange) => ({ label: rangeLabel(historyRange), value: historyRange }))}
        value={controller.range}
      />
      <Button
        aria-label={controller.activeServer ? `Refresh stored history for ${controller.activeServer.name}` : 'Refresh stored history'}
        disabled={!controller.hasConcreteServer || controller.historyQuery.isFetching || controller.refreshFeedback.state === 'pending'}
        onClick={() => void controller.refreshHistory()}
        type="button"
        variant="secondary"
      >
        Refresh history
      </Button>
    </InlineToolbar>
    <div className="history-controls-feedback mt-3">
      {controller.refreshFeedback.state === 'pending' ? <ResultFeedback label="History refresh" state="pending" /> : null}
      {controller.refreshFeedback.state === 'success' ? <ResultFeedback label="History refresh result" message={controller.refreshFeedback.message} state="success" /> : null}
      {controller.refreshFeedback.state === 'error' ? <ResultFeedback label="History refresh result" message={controller.refreshFeedback.message} state="error" /> : null}
    </div>
  </div>
);

export const HistoryMetricToggles = ({ selectedMetrics, toggleMetric }: { readonly selectedMetrics: readonly HistoryMetricId[]; readonly toggleMetric: (metricId: HistoryMetricId) => void }) => (
  <div className="surface p-4">
    <div className="metric-label">Metrics</div>
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Metric toggles">
      {historyMetricDefinitions.map((metric) => {
        const isSelected = selectedMetrics.includes(metric.id);
        return (
          <Button
            aria-pressed={isSelected}
            className={isSelected ? 'border-[color:var(--color-brand)] bg-[var(--color-brand-soft)] text-[color:var(--color-brand)]' : undefined}
            key={metric.id}
            onClick={() => toggleMetric(metric.id)}
            type="button"
            variant="secondary"
          >
            {metric.label}
          </Button>
        );
      })}
    </div>
  </div>
);
