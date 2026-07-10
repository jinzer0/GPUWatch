import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  InlineToolbar,
  MiniLineChart,
  ResultFeedback,
  TimeSeriesChart,
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

  it('renders shared pending refresh feedback as an accessible live status', () => {
    render(<ResultFeedback label="Overview refresh" state="pending" />);

    const status = screen.getByRole('status', { name: 'Overview refresh' });

    expect(status.textContent).toContain('Overview refresh');
    expect(status.textContent).toContain('pending');
    expect(status.querySelector('.surface')).toBeDefined();
  });

  it('renders shared success feedback with a badge and sanitized message text', () => {
    render(<ResultFeedback message="Refresh used /Users/alice/.ssh/id_ed25519 and --token secret-value" state="success" />);

    const status = screen.getByRole('status', { name: 'success result' });

    expect(status.textContent).toContain('success');
    expect(status.textContent).toContain('[path redacted]');
    expect(status.textContent).toContain('--token=[redacted]');
    expect(status.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(status.textContent).not.toContain('secret-value');
    expect(status.querySelector('.status-online')).toBeDefined();
  });

  it('renders shared error feedback as an alert with badge and sanitized message text', () => {
    render(<ResultFeedback message="SSH failed for /Users/alice/.ssh/id_ed25519" state="error" />);

    const alert = screen.getByRole('alert', { name: 'error result' });

    expect(alert.textContent).toContain('error');
    expect(alert.textContent).toContain('[path redacted]');
    expect(alert.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(alert.querySelector('.status-error')).toBeDefined();
    expect(alert.className).toContain('surface');
    expect(alert.querySelector('.surface')).toBeDefined();
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


  it('renders an accessible time series chart with a single selected metric sample', () => {
    render(
      <TimeSeriesChart
        ariaLabel="GPU utilization over time"
        density="compact"
        height={88}
        range={{ min: 0, max: 100 }}
        samples={[{ receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 42 }]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'GPU utilization over time' });
    expect(chart.getAttribute('class')).toContain('time-series-chart-svg');
    expect(chart.getAttribute('height')).toBe('88');
    expect(chart.closest('.time-series-chart')?.className).toContain('time-series-chart-compact');
    expect(chart.querySelector('[data-chart-point-value="42"]')).toBeDefined();
  });

  it('renders time series empty state for empty data or all-null selected metric values', () => {
    const { rerender } = render(
      <TimeSeriesChart
        ariaLabel="Memory history"
        emptyLabel="No memory samples"
        samples={[]}
        series={[{ id: 'memory', label: 'Memory', metric: 'memoryUsedMiB' }]}
      />
    );

    expect(screen.getByText('No memory samples')).toBeDefined();
    expect(screen.queryByRole('img', { name: 'Memory history' })).toBeNull();

    rerender(
      <TimeSeriesChart
        ariaLabel="Memory history"
        emptyLabel="No memory samples"
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', memoryUsedMiB: null },
          { receivedAt: '2026-06-04T00:00:30.000Z', memoryUsedMiB: null }
        ]}
        series={[{ id: 'memory', label: 'Memory', metric: 'memoryUsedMiB' }]}
      />
    );

    expect(screen.getByText('No memory samples')).toBeDefined();
    expect(screen.queryByRole('img', { name: 'Memory history' })).toBeNull();
  });

  it('renders null metric values as gaps instead of zeroes', () => {
    render(
      <TimeSeriesChart
        ariaLabel="GPU gap history"
        pollingIntervalSeconds={30}
        range={{ min: 0, max: 40 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: '2026-06-04T00:00:30.000Z', gpuUtilizationPercent: null },
          { receivedAt: '2026-06-04T00:01:00.000Z', gpuUtilizationPercent: 30 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'GPU gap history' });
    expect(chart.querySelectorAll('[data-chart-point-value]')).toHaveLength(2);
    expect(chart.querySelector('[data-chart-point-value="0"]')).toBeNull();
    expect(chart.querySelectorAll('[data-chart-gap="metric-null"]')).toHaveLength(1);
  });

  it('renders multi-series time paths from metric keys and extractor functions', () => {
    render(
      <TimeSeriesChart
        ariaLabel="GPU and memory history"
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10, memoryUtilizationPercent: 25 },
          { receivedAt: '2026-06-04T00:00:30.000Z', gpuUtilizationPercent: 20, memoryUtilizationPercent: 35 },
          { receivedAt: '2026-06-04T00:01:00.000Z', gpuUtilizationPercent: 30, memoryUtilizationPercent: 45 }
        ]}
        series={[
          { id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent', tone: 'accent' },
          { id: 'memory', label: 'Memory', metric: (sample) => sample.memoryUtilizationPercent, tone: 'brand' }
        ]}
      />
    );

    const chart = screen.getByRole('img', { name: 'GPU and memory history' });
    expect(chart.querySelectorAll('[data-chart-series-id="gpu"]')).toHaveLength(1);
    expect(chart.querySelectorAll('[data-chart-series-id="memory"]')).toHaveLength(1);
    expect(chart.querySelector('[data-chart-point-value="0"]')).toBeNull();
  });

  it('marks inferred timestamp gaps when samples arrive beyond the polling gap threshold', () => {
    render(
      <TimeSeriesChart
        ariaLabel="Time gap history"
        pollingIntervalSeconds={30}
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: '2026-06-04T00:00:30.000Z', gpuUtilizationPercent: 20 },
          { receivedAt: '2026-06-04T00:05:00.000Z', gpuUtilizationPercent: 30 },
          { receivedAt: '2026-06-04T00:05:30.000Z', gpuUtilizationPercent: 40 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'Time gap history' });
    expect(chart.querySelectorAll('[data-chart-series-id="gpu"]')).toHaveLength(2);
    expect(chart.querySelectorAll('[data-chart-gap="time"]')).toHaveLength(1);
    expect(chart.querySelector('[data-chart-gap-seconds="270"]')).toBeDefined();
  });

});
