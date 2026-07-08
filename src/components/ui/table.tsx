export type SortDirection = 'ascending' | 'descending' | null;

export const sortDirectionToAriaSort = (direction: SortDirection) => direction ?? 'none';

const sortDirectionLabel = (direction: SortDirection) => {
  if (direction === 'ascending') {
    return 'ascending';
  }
  if (direction === 'descending') {
    return 'descending';
  }
  return 'not sorted';
};

export const SortableTableHeader = ({ direction = null, label, onSort }: { readonly direction?: SortDirection; readonly label: string; readonly onSort: () => void }) => (
  <th aria-sort={sortDirectionToAriaSort(direction)} className="px-4 py-3" scope="col">
    <button
      aria-label={`Sort ${label} ${sortDirectionLabel(direction)}`}
      className="table-head inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left transition hover:bg-[var(--color-accent-soft)] hover:text-[color:var(--color-accent)]"
      onClick={onSort}
      type="button"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="font-[var(--font-display)] text-[color:var(--color-accent)]">
        {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}
      </span>
    </button>
  </th>
);
