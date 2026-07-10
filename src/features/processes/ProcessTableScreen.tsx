import { EmptyState, ErrorState, LoadingState, ResultFeedback } from '../../components/ui';
import { ProcessDetailDrawer } from './ProcessDetailDrawer';
import { ProcessRowsTable } from './ProcessRowsTable';
import { ProcessTableToolbar } from './ProcessTableToolbar';
import { useProcessTableController } from './useProcessTableController';

export const ProcessTableScreen = () => {
  const controller = useProcessTableController();

  return (
    <section className="space-y-6">
      <header className="border-b border-[color:var(--color-line)] pb-5">
        <div className="eyebrow">Process Table</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">GPU memory ledger</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
          Flattened backend process rows, default sorted by GPU memory descending with stale snapshot rows visibly marked.
        </p>
      </header>

      {controller.isLoading ? (
        <LoadingState label="Loading process DTO rows..." />
      ) : (
        <>
          <ProcessTableToolbar controller={controller} />
          {controller.refreshFeedback ? <ResultFeedback {...controller.refreshFeedback} /> : null}
          {controller.queryError && controller.processRows.length === 0 ? (
            <ErrorState message={controller.queryError.message} />
          ) : controller.processRows.length === 0 ? (
            <EmptyState title="No processes" body="No latest successful GPU process rows are currently available." />
          ) : controller.visibleRows.length === 0 ? (
            <EmptyState title="No processes match filters" body="Adjust or reset the Process Table filters to show rows again." />
          ) : (
            <ProcessRowsTable controller={controller} />
          )}
        </>
      )}
      {controller.selectedProcess ? <ProcessDetailDrawer onClose={controller.closeProcessDetails} row={controller.selectedProcess} /> : null}
    </section>
  );
};
