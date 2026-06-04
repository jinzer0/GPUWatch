import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  InlineToolbar,
  MiniLineChart,
  LabeledSelect,
  LabeledTextInput,
  ResetButton,
  RightDrawer,
  SortableTableHeader,
  sortDirectionToAriaSort
} from './ui';

describe('shared UI primitives', () => {
  it('renders inline toolbar with labeled text input and select controls', () => {
    render(
      <InlineToolbar label="Process filters" summary="Frontend-local visibility controls">
        <LabeledTextInput id="command-filter" label="Command" onChange={() => undefined} value="python" />
        <LabeledSelect
          id="status-filter"
          label="Status"
          onChange={() => undefined}
          options={[
            { label: 'All statuses', value: 'all' },
            { label: 'Stale only', value: 'stale' }
          ]}
          value="all"
        />
      </InlineToolbar>
    );

    expect(screen.getByText('Process filters')).toBeDefined();
    expect(screen.getByText('Frontend-local visibility controls')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDefined();
  });

  it('renders reset button with the shared secondary button style', () => {
    const onReset = vi.fn();

    render(<ResetButton onClick={onReset} />);

    const button = screen.getByRole('button', { name: 'Reset filters' });
    fireEvent.click(button);

    expect(button.className).toContain('btn');
    expect(button.className).toContain('btn-secondary');
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('exposes sortable table header state through aria-sort and button text', () => {
    const onSort = vi.fn();

    render(
      <table>
        <thead>
          <tr>
            <SortableTableHeader direction="descending" label="GPU memory" onSort={onSort} />
          </tr>
        </thead>
      </table>
    );

    const header = screen.getByRole('columnheader', { name: /gpu memory/i });
    const button = screen.getByRole('button', { name: /sort gpu memory descending/i });

    fireEvent.click(button);

    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(sortDirectionToAriaSort(null)).toBe('none');
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it('renders accessible right drawer shell and closes from button or Escape', () => {
    const onClose = vi.fn();

    render(
      <RightDrawer ariaLabel="Process details" onClose={onClose} title="PID 4242">
        <p>Read-only process metadata</p>
      </RightDrawer>
    );

    expect(screen.getByRole('dialog', { name: 'Process details' })).toBeDefined();
    expect(screen.getByText('PID 4242')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders a mini line chart with an accessible label and numeric points only', () => {
    render(<MiniLineChart ariaLabel="GPU utilization history" values={[10, null, 40, 70]} />);

    const chart = screen.getByRole('img', { name: 'GPU utilization history' });
    expect(chart).toBeDefined();
    expect(chart.querySelectorAll('polyline')).toHaveLength(2);
    expect(chart.querySelector('[data-chart-point-value="0"]')).toBeNull();
    expect(chart.querySelector('[data-chart-point-value="10"]')).toBeDefined();
    expect(chart.querySelector('[data-chart-point-value="40"]')).toBeDefined();
  });

  it('renders mini line chart empty state for empty or all-null values', () => {
    const { rerender } = render(<MiniLineChart ariaLabel="Memory history" values={[]} />);

    expect(screen.getByText('Not enough samples')).toBeDefined();
    expect(screen.queryByRole('img', { name: 'Memory history' })).toBeNull();

    rerender(<MiniLineChart ariaLabel="Memory history" values={[null, null]} />);

    expect(screen.getByText('Not enough samples')).toBeDefined();
    expect(screen.queryByRole('img', { name: 'Memory history' })).toBeNull();
  });

  it('supports compact mini line chart rendering', () => {
    render(<MiniLineChart ariaLabel="PCIe RX history" density="compact" values={[5, 15, 10]} />);

    const chart = screen.getByRole('img', { name: 'PCIe RX history' });
    expect(chart.getAttribute('class')).toContain('mini-line-chart-svg');
    expect(chart.getAttribute('height')).toBe('34');
    expect(chart.closest('.mini-line-chart')?.className).toContain('mini-line-chart-compact');
  });

});
