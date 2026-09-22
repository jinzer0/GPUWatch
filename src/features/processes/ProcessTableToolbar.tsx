import { Button, LabeledSelect, LabeledTextInput, ResetButton } from '../../components/ui';
import { ALL_PROCESS_FILTER_VALUE, parseProcessStaleFilter, parseProcessViewMode, type ProcessTableController } from './processTableModel';

const freshnessLabels = {
  all: 'Current + stale rows',
  current: 'Current rows only',
  stale: 'Stale rows only'
} as const;

const viewModeLabels = {
  flat: 'Flat activity',
  parentGrouped: 'Parent grouped activity',
  userGrouped: 'User grouped activity'
} as const;

const optionLabel = (options: readonly { readonly label: string; readonly value: string }[], value: string, fallback: string) =>
  options.find((option) => option.value === value)?.label ?? fallback;

const activeFilterCount = (controller: ProcessTableController) =>
  [
    controller.searchText.trim() !== '',
    controller.selectedServerValue !== ALL_PROCESS_FILTER_VALUE,
    controller.selectedGpuValue !== ALL_PROCESS_FILTER_VALUE,
    controller.processKindFilter !== ALL_PROCESS_FILTER_VALUE,
    controller.staleFilter !== 'all'
  ].filter(Boolean).length;

export const ProcessTableToolbar = ({ controller }: { readonly controller: ProcessTableController }) => {
  const serverOptions = [{ label: 'All servers', value: ALL_PROCESS_FILTER_VALUE }, ...controller.serverOptions];
  const gpuOptions = [{ label: 'All GPUs', value: ALL_PROCESS_FILTER_VALUE }, ...controller.gpuOptions];
  const kindLabel = optionLabel(controller.processKindOptions, controller.processKindFilter, 'All kinds');
  const filterCount = activeFilterCount(controller);
  const visibleRowCopy = `${controller.visibleRows.length} of ${controller.processRows.length} rows`;

  return (
    <section aria-label="Process ledger command strip" className="process-ledger-command-strip surface" role="region">
      <div className="process-ledger-toolbar-summary">
        <div>
          <div className="metric-label">GPU Activity Monitor scope</div>
          <p className="process-ledger-toolbar-summary-copy">
            {visibleRowCopy} visible ·{' '}
            {filterCount === 0 ? 'No active filters' : `${filterCount} active ${filterCount === 1 ? 'filter' : 'filters'}`} · {viewModeLabels[controller.viewMode]}
          </p>
        </div>
        <div aria-label="Active process table scope" className="process-ledger-scope-chips" role="list">
          <span className="process-ledger-scope-chip" role="listitem">
            {optionLabel(serverOptions, controller.selectedServerValue, 'All servers')}
          </span>
          <span className="process-ledger-scope-chip" role="listitem">
            {optionLabel(gpuOptions, controller.selectedGpuValue, 'All GPUs')}
          </span>
          <span className="process-ledger-scope-chip" role="listitem">
            {kindLabel}
          </span>
          <span className="process-ledger-scope-chip" role="listitem">
            {freshnessLabels[controller.staleFilter]}
          </span>
        </div>
      </div>
      <div className="process-ledger-command-primary">
        <div className="process-ledger-command-search">
          <LabeledTextInput id="process-search" label="Search" onChange={(event) => controller.setSearchText(event.target.value)} placeholder="PID, user, command, or host" value={controller.searchText} />
        </div>
        <div className="process-ledger-command-server">
          <LabeledSelect
            id="process-server-filter"
            label="Server"
            onChange={(event) => controller.setServerFilter(event.target.value)}
            options={serverOptions}
            value={controller.selectedServerValue}
          />
        </div>
        <div className="process-ledger-command-gpu">
          <LabeledSelect
            id="process-gpu-filter"
            label="GPU"
            onChange={(event) => controller.setGpuFilter(event.target.value)}
            options={gpuOptions}
            value={controller.selectedGpuValue}
          />
        </div>
        <Button aria-label="Refresh process rows" disabled={controller.refreshFeedback?.state === 'pending'} onClick={() => void controller.handleRefreshRows()} size="sm" type="button" variant="secondary">
          Refresh
        </Button>
      </div>
      <div aria-label="Process ledger secondary filters" className="process-ledger-command-secondary" role="group">
        <LabeledSelect
          id="process-kind-filter"
          label="Kind"
          onChange={(event) => controller.setProcessKindFilter(event.target.value)}
          options={controller.processKindOptions}
          value={controller.processKindFilter}
        />
        <LabeledSelect
          id="process-stale-filter"
          label="Freshness"
          onChange={(event) => controller.setStaleFilter(parseProcessStaleFilter(event.target.value))}
          options={[
            { label: 'All rows', value: 'all' },
            { label: 'Current only', value: 'current' },
            { label: 'Stale only', value: 'stale' }
          ]}
          value={controller.staleFilter}
        />
        <LabeledSelect
          id="process-view-mode"
          label="View"
          onChange={(event) => controller.setViewMode(parseProcessViewMode(event.target.value))}
          options={[
            { label: 'Flat', value: 'flat' },
            { label: 'Parent grouped', value: 'parentGrouped' },
            { label: 'User grouped', value: 'userGrouped' }
          ]}
          value={controller.viewMode}
        />
        <ResetButton onClick={controller.resetFilters} />
      </div>
    </section>
  );
};
