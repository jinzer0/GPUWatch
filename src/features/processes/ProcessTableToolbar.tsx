import { Button, LabeledSelect, LabeledTextInput, ResetButton } from '../../components/ui';
import { ALL_PROCESS_FILTER_VALUE, parseProcessStaleFilter, parseProcessViewMode, type ProcessTableController } from './processTableModel';

export const ProcessTableToolbar = ({ controller }: { readonly controller: ProcessTableController }) => (
  <section aria-label="Process ledger command strip" className="process-ledger-command-strip surface" role="region">
    <div className="process-ledger-command-primary">
      <div className="process-ledger-command-search">
        <LabeledTextInput id="process-search" label="Search" onChange={(event) => controller.setSearchText(event.target.value)} placeholder="PID, user, command, or host" value={controller.searchText} />
      </div>
      <div className="process-ledger-command-server">
        <LabeledSelect
          id="process-server-filter"
          label="Server"
          onChange={(event) => controller.setServerFilter(event.target.value)}
          options={[{ label: 'All servers', value: ALL_PROCESS_FILTER_VALUE }, ...controller.serverOptions]}
          value={controller.selectedServerValue}
        />
      </div>
      <div className="process-ledger-command-gpu">
        <LabeledSelect
          id="process-gpu-filter"
          label="GPU"
          onChange={(event) => controller.setGpuFilter(event.target.value)}
          options={[{ label: 'All GPUs', value: ALL_PROCESS_FILTER_VALUE }, ...controller.gpuOptions]}
          value={controller.selectedGpuValue}
        />
      </div>
      <Button aria-label="Refresh process rows" disabled={controller.refreshFeedback?.state === 'pending'} onClick={() => void controller.handleRefreshRows()} size="sm" type="button" variant="secondary">
        Refresh
      </Button>
    </div>
    <div aria-label="Process ledger secondary filters" className="process-ledger-command-secondary" role="group">
      <LabeledSelect id="process-kind-filter" label="Kind" onChange={(event) => controller.setProcessKindFilter(event.target.value)} options={controller.processKindOptions} value={controller.processKindFilter} />
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
