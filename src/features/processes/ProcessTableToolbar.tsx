import { InlineToolbar, LabeledSelect, LabeledTextInput, ResetButton } from '../../components/ui';
import { ALL_PROCESS_FILTER_VALUE, parseProcessStaleFilter, parseProcessViewMode, type ProcessTableController } from './processTableModel';

export const ProcessTableToolbar = ({ controller }: { readonly controller: ProcessTableController }) => (
  <InlineToolbar label="Process filters" summary={`Showing ${controller.visibleRows.length} of ${controller.processRows.length} processes`}>
    <LabeledTextInput id="process-search" label="Search" onChange={(event) => controller.setSearchText(event.target.value)} value={controller.searchText} />
    <LabeledSelect
      id="process-server-filter"
      label="Server"
      onChange={(event) => controller.setServerFilter(event.target.value)}
      options={[{ label: 'All servers', value: ALL_PROCESS_FILTER_VALUE }, ...controller.serverOptions]}
      value={controller.selectedServerValue}
    />
    <LabeledSelect
      id="process-gpu-filter"
      label="GPU"
      onChange={(event) => controller.setGpuFilter(event.target.value)}
      options={[{ label: 'All GPUs', value: ALL_PROCESS_FILTER_VALUE }, ...controller.gpuOptions]}
      value={controller.selectedGpuValue}
    />
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
    <button className="btn btn-secondary" disabled={controller.refreshFeedback?.state === 'pending'} onClick={() => void controller.handleRefreshRows()} type="button">
      Refresh rows
    </button>
  </InlineToolbar>
);
