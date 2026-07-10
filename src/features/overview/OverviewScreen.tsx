import { EmptyState, ErrorState, InlineToolbar, LabeledSelect, LabeledTextInput, LoadingState, ResetButton, ResultFeedback } from '../../components/ui';
import type { ServerOverviewDto } from '../../lib/types';
import { OverviewServerCard } from './OverviewServerCard';
import { parseOverviewQuickFilter } from './overviewModel';
import { useOverviewController } from './useOverviewController';

export const OverviewScreen = ({ overview, isLoading, error }: { readonly overview: ServerOverviewDto[]; readonly isLoading: boolean; readonly error: Error | null }) => {
  const controller = useOverviewController(overview);
  const showNoData = !isLoading && !error && overview.length === 0;
  const showFilteredEmpty = !isLoading && !error && overview.length > 0 && controller.visibleRows.length === 0;

  return (
    <section className="space-y-6">
      <div className="border-b border-[color:var(--color-line)] pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Overview</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Fleet snapshot</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">A terse readout of configured GPU hosts, latest successful polls, and current health metadata.</p>
          </div>
          <button className="btn btn-primary" disabled={controller.seedMutation.isPending} onClick={() => controller.seedMutation.mutate()} type="button">
            Seed demo data
          </button>
        </div>
        {controller.seedFeedback ? (
          <div className="mt-4">
            <ResultFeedback {...controller.seedFeedback} />
          </div>
        ) : null}
      </div>

      <InlineToolbar label="Overview filters" summary={`Showing ${controller.visibleRows.length} of ${overview.length} servers`}>
        <LabeledTextInput id="overview-search" label="Search servers" onChange={(event) => controller.setSearchText(event.target.value)} placeholder="Name, host, status, or error" value={controller.searchText} />
        <LabeledSelect id="overview-status" label="Status" onChange={(event) => controller.setStatusFilter(event.target.value)} options={controller.statusOptions} value={controller.statusFilter} />
        <LabeledSelect
          id="overview-quick-filter"
          label="Quick filter"
          onChange={(event) => controller.setQuickFilter(parseOverviewQuickFilter(event.target.value))}
          options={[
            { label: 'All servers', value: 'all' },
            { label: 'Stale only', value: 'stale' },
            { label: 'Errors only', value: 'error' }
          ]}
          value={controller.quickFilter}
        />
        <ResetButton onClick={controller.resetFilters} />
      </InlineToolbar>

      {isLoading ? <LoadingState label="Loading overview DTOs..." /> : null}
      {error ? <ErrorState message={error.message} /> : null}
      {showNoData ? <EmptyState body="Add a server or seed demo data to populate the fleet snapshot." title="No servers configured" /> : null}
      {showFilteredEmpty ? <EmptyState body="Try a broader search or reset the local visibility controls." title="No servers match these filters" /> : null}

      <div className="grid gap-4">
        {controller.visibleRows.map((server) => (
          <OverviewServerCard controller={controller} key={server.id} server={server} />
        ))}
      </div>
    </section>
  );
};
