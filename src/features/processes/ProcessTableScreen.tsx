import { Button, EmptyState, ErrorState, LoadingState, ResultFeedback } from '../../components/ui';
import { formatMiB } from '../../lib/format';
import { ProcessDetailDrawer } from './ProcessDetailDrawer';
import { ProcessRowsTable } from './ProcessRowsTable';
import { ProcessTableToolbar } from './ProcessTableToolbar';
import { summarizeProcessLedger, type ProcessLedgerSummary } from './processTableModel';
import { useProcessTableController } from './useProcessTableController';

const formatLedgerMemory = (summary: ProcessLedgerSummary) => {
  switch (summary.memoryStatus) {
    case 'known':
      return `known memory ${formatMiB(summary.gpuMemoryUsedMiB)}`;
    case 'partial':
      return `partial memory ${formatMiB(summary.gpuMemoryUsedMiB)}`;
    case 'unknown':
      return 'unknown memory';
  }

  const exhaustiveStatus: never = summary.memoryStatus;
  return exhaustiveStatus;
};

const ProcessLedgerSummaryStrip = ({ summary }: { readonly summary: ProcessLedgerSummary }) => {
  const summaryText = `Showing ${summary.visibleProcessRowCount} of ${summary.totalProcessRowCount} process rows across ${summary.uniqueServerIdCount} server IDs and ${summary.uniqueGpuUuidCount} GPU UUIDs; ${summary.currentProcessRowCount} current / ${summary.staleProcessRowCount} stale; ${formatLedgerMemory(summary)}.`;

  return (
    <section aria-label="Process ledger summary" className="process-ledger-summary surface" role="region">
      <div className="metric-label">Ledger scope</div>
      <p className="process-ledger-summary-copy">{summaryText}</p>
    </section>
  );
};

const FilteredProcessEmptyState = ({ onReset }: { readonly onReset: () => void }) => (
  <div className="process-ledger-filtered-empty surface">
    <div className="section-title">No processes match filters</div>
    <p>Adjust or reset the Process Table filters to show rows again.</p>
    <Button onClick={onReset} type="button" variant="secondary">
      Reset filters
    </Button>
  </div>
);

export const ProcessTableScreen = () => {
  const controller = useProcessTableController();
  const summary = summarizeProcessLedger(controller.processRows, controller.visibleRows);

  return (
    <section className="process-ledger-page space-y-6">
      <header className="process-ledger-header border-b border-[color:var(--color-line)] pb-5">
        <div className="eyebrow">Process Table</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]" ref={controller.focusFallbackRef} tabIndex={-1}>
          GPU memory ledger
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
          Flattened backend process rows, default sorted by GPU memory descending with stale snapshot rows visibly marked.
        </p>
      </header>

      {controller.isLoading ? (
        <LoadingState label="Loading process DTO rows..." />
      ) : (
        <>
          <ProcessLedgerSummaryStrip summary={summary} />
          <ProcessTableToolbar controller={controller} />
          {controller.refreshFeedback ? <ResultFeedback {...controller.refreshFeedback} /> : null}
          {controller.queryError && controller.processRows.length === 0 ? (
            <ErrorState message={controller.queryError.message} />
          ) : controller.processRows.length === 0 ? (
            <EmptyState title="No processes" body="No latest successful GPU process rows are currently available." />
          ) : controller.visibleRows.length === 0 ? (
            <FilteredProcessEmptyState onReset={controller.resetFilters} />
          ) : (
            <ProcessRowsTable controller={controller} />
          )}
        </>
      )}
      {controller.selectedProcess ? <ProcessDetailDrawer onClose={controller.closeProcessDetails} row={controller.selectedProcess} /> : null}
    </section>
  );
};
