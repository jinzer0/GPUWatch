import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Button,
  DiagnosticPanel,
  ErrorState,
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
import { buildTimeSeries } from './ui/chartMath';

describe('shared UI primitives', () => {
  it('renders Button with native button type and accessible name from children', () => {
    render(<Button>Refresh now</Button>);

    const button = screen.getByRole('button', { name: 'Refresh now' });

    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('btn');
  });

  it('renders Button variants through semantic class markers', () => {
    const variantCases = [
      { expectedClass: 'btn-primary', label: 'Primary action', variant: 'primary' },
      { expectedClass: 'btn-secondary', label: 'Secondary action', variant: 'secondary' },
      { expectedClass: 'btn-ghost', label: 'Ghost action', variant: 'ghost' },
      { expectedClass: 'btn-danger', label: 'Danger action', variant: 'danger' }
    ] as const;

    for (const { expectedClass, label, variant } of variantCases) {
      const { unmount } = render(<Button variant={variant}>{label}</Button>);
      const button = screen.getByRole('button', { name: label });

      expect(button.className).toContain('btn');
      expect(button.className).toContain(expectedClass);

      unmount();
    }
  });

  it('renders Button sizes through semantic class markers', () => {
    const sizeCases = [
      { expectedClass: 'btn-sm', label: 'Small action', size: 'sm' },
      { expectedClass: 'btn-md', label: 'Medium action', size: 'md' }
    ] as const;

    for (const { expectedClass, label, size } of sizeCases) {
      const { unmount } = render(<Button size={size}>{label}</Button>);
      const button = screen.getByRole('button', { name: label });

      expect(button.className).toContain(expectedClass);

      unmount();
    }
  });

  it('keeps Button disabled actions natively non-interactive', () => {
    const onClick = vi.fn();

    render(
      <Button disabled onClick={onClick}>
        Delete server
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Delete server' });
    fireEvent.click(button);

    expect(button.hasAttribute('disabled')).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('extends Button className without dropping the base class', () => {
    render(<Button className="settings-action">Save server</Button>);

    const button = screen.getByRole('button', { name: 'Save server' });

    expect(button.className).toContain('btn');
    expect(button.className).toContain('settings-action');
  });

  it('keeps Button accessible name from aria-label when children are decorative', () => {
    render(
      <Button aria-label="Refresh selected server">
        <span aria-hidden="true">Refresh</span>
      </Button>
    );

    expect(screen.getByRole('button', { name: 'Refresh selected server' })).toBeDefined();
  });

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

  it('connects form helper text to labeled controls through aria-describedby', () => {
    render(
      <InlineToolbar label="Process filters">
        <LabeledTextInput helperText="Matches process command substrings" id="command-filter" label="Command" onChange={() => undefined} value="python" />
        <LabeledSelect
          helperText="Choose whether stale rows are visible"
          id="stale-filter"
          label="Stale rows"
          onChange={() => undefined}
          options={[
            { label: 'All rows', value: 'all' },
            { label: 'Current rows only', value: 'current' }
          ]}
          value="all"
        />
      </InlineToolbar>
    );

    const textInput = screen.getByRole('textbox', { name: 'Command' });
    const select = screen.getByRole('combobox', { name: 'Stale rows' });

    expect(textInput.getAttribute('aria-describedby')).toBe('command-filter-hint');
    expect(select.getAttribute('aria-describedby')).toBe('stale-filter-hint');
    expect(screen.getByText('Matches process command substrings')).toBeDefined();
    expect(screen.getByText('Choose whether stale rows are visible')).toBeDefined();
  });

  it('keeps disabled form controls discoverable and non-interactive', () => {
    const onTextChange = vi.fn();
    const onSelectChange = vi.fn();

    render(
      <InlineToolbar label="Disabled filters">
        <LabeledTextInput disabled helperText="Unavailable while data loads" id="disabled-command" label="Command" onChange={onTextChange} value="python" />
        <LabeledSelect
          disabled
          helperText="Unavailable while data loads"
          id="disabled-status"
          label="Status"
          onChange={onSelectChange}
          options={[
            { label: 'All statuses', value: 'all' },
            { label: 'Stale only', value: 'stale' }
          ]}
          value="all"
        />
      </InlineToolbar>
    );

    const textInput = screen.getByRole('textbox', { name: 'Command' });
    const select = screen.getByRole('combobox', { name: 'Status' });

    fireEvent.change(textInput, { target: { value: 'node' } });
    fireEvent.change(select, { target: { value: 'stale' } });

    expect(textInput.hasAttribute('disabled')).toBe(true);
    expect(select.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('Unavailable while data loads')).toHaveLength(2);
    expect(onTextChange).not.toHaveBeenCalled();
    expect(onSelectChange).not.toHaveBeenCalled();
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

  it('renders ErrorState as an alert with sanitized message text', () => {
    render(<ErrorState message="SSH failed for /Users/alice/.ssh/id_ed25519 with --password hunter2" />);

    const alert = screen.getByRole('alert');

    expect(alert.textContent).toContain('[path redacted]');
    expect(alert.textContent).toContain('--password=[redacted]');
    expect(alert.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(alert.textContent).not.toContain('hunter2');
  });

  it('renders shared success feedback with a badge and sanitizeMessage redaction', () => {
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
    expect(alert.querySelectorAll('.surface')).toHaveLength(0);
  });

  it('renders diagnostic error feedback as an alert with formatted guidance', () => {
    render(
      <ResultFeedback
        diagnostic={{ errorType: 'ssh_auth_failed', message: 'Private key failed at /Users/alice/.ssh/id_ed25519 with --token secret-value' }}
        label="SSH test"
        message="Fallback diagnostic"
        state="error"
      />
    );

    const alert = screen.getByRole('alert', { name: 'SSH test' });

    expect(alert.textContent).toContain('SSH authentication failed');
    expect(alert.textContent).toContain('Type: ssh_auth_failed');
    expect(alert.textContent).toContain('[path redacted]');
    expect(alert.textContent).toContain('--token=[redacted]');
    expect(alert.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(alert.textContent).not.toContain('secret-value');
  });

  it('preserves DiagnosticPanel formatDiagnostic formatting and redaction behavior', () => {
    const escape = String.fromCharCode(27);

    render(
      <DiagnosticPanel
        errorType="backend_unavailable"
        message={`${escape}[31mHelper failed for /Users/alice/.ssh/id_ed25519 with --api-key secret-value${escape}[0m`}
        title="Connection diagnostic"
      />
    );

    const panelText = screen.getByText('Connection diagnostic').parentElement?.textContent ?? '';

    expect(screen.getByText('Connection diagnostic')).toBeDefined();
    expect(screen.getByText('Desktop backend unavailable')).toBeDefined();
    expect(screen.getByText('Type: backend_unavailable')).toBeDefined();
    expect(panelText).toContain('Message: Helper failed for [path redacted] with --api-key=[redacted]');
    expect(panelText).not.toContain(escape);
    expect(panelText).not.toContain('secret-value');
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
    expect(chart.querySelectorAll('[data-chart-point-value]')).toHaveLength(1);
    expect(chart.querySelector('[data-chart-point-value="42"]')).toBeDefined();
    expect(chart.querySelector('[data-chart-series-id="gpu"]')).toBeNull();
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

  it('drops invalid timestamps before rendering time series points', () => {
    render(
      <TimeSeriesChart
        ariaLabel="Invalid timestamp history"
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: 'not-a-date', gpuUtilizationPercent: 99 },
          { receivedAt: Number.NaN, gpuUtilizationPercent: 88 },
          { receivedAt: '2026-06-04T00:01:00.000Z', gpuUtilizationPercent: 30 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'Invalid timestamp history' });
    const pointValues = Array.from(chart.querySelectorAll('[data-chart-point-value]')).map((point) => point.getAttribute('data-chart-point-value'));

    expect(pointValues).toEqual(['10', '30']);
    expect(chart.querySelector('[data-chart-point-value="99"]')).toBeNull();
    expect(chart.querySelector('[data-chart-point-value="88"]')).toBeNull();
  });

  it('sorts time series samples by ascending timestamp before rendering points', () => {
    render(
      <TimeSeriesChart
        ariaLabel="Sorted timestamp history"
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:02:00.000Z', gpuUtilizationPercent: 30 },
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: '2026-06-04T00:01:00.000Z', gpuUtilizationPercent: 20 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'Sorted timestamp history' });
    const points = Array.from(chart.querySelectorAll('[data-chart-point-value]'));

    expect(points.map((point) => point.getAttribute('data-chart-point-value'))).toEqual(['10', '20', '30']);
    expect(points.map((point) => point.getAttribute('cx'))).toEqual(['0', '280', '560']);
  });

  it('renders chart gap attributes for null and non-finite metrics with no zero points', () => {
    render(
      <TimeSeriesChart
        ariaLabel="Non-finite metric gap history"
        pollingIntervalSeconds={30}
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: '2026-06-04T00:00:30.000Z', gpuUtilizationPercent: null },
          { receivedAt: '2026-06-04T00:01:00.000Z', gpuUtilizationPercent: Number.NaN },
          { receivedAt: '2026-06-04T00:01:30.000Z', gpuUtilizationPercent: Number.POSITIVE_INFINITY },
          { receivedAt: '2026-06-04T00:02:00.000Z', gpuUtilizationPercent: Number.NEGATIVE_INFINITY },
          { receivedAt: '2026-06-04T00:02:30.000Z', gpuUtilizationPercent: 40 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'Non-finite metric gap history' });
    const pointValues = Array.from(chart.querySelectorAll('[data-chart-point-value]')).map((point) => point.getAttribute('data-chart-point-value'));

    expect(pointValues).toEqual(['10', '40']);
    expect(chart.querySelectorAll('[data-chart-gap="metric-null"]')).toHaveLength(4);
    expect(chart.querySelector('[data-chart-point-value="0"]')).toBeNull();
    console.info('chart integrity evidence: metric-null gaps=4; point values=10,40; zero point absent for null/non-finite metric cases');
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

  it('does not mark a time gap when elapsed seconds equal the inferred threshold', () => {
    render(
      <TimeSeriesChart
        ariaLabel="Threshold equality history"
        pollingIntervalSeconds={60}
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: '2026-06-04T00:02:00.000Z', gpuUtilizationPercent: 20 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'Threshold equality history' });
    expect(chart.querySelectorAll('[data-chart-gap="time"]')).toHaveLength(0);
    expect(chart.querySelectorAll('[data-chart-series-id="gpu"]')).toHaveLength(1);
  });

  it('marks a time gap when elapsed seconds exceed the inferred threshold', () => {
    render(
      <TimeSeriesChart
        ariaLabel="Threshold exceeded history"
        pollingIntervalSeconds={60}
        range={{ min: 0, max: 100 }}
        samples={[
          { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 10 },
          { receivedAt: '2026-06-04T00:02:01.000Z', gpuUtilizationPercent: 20 }
        ]}
        series={[{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }]}
      />
    );

    const chart = screen.getByRole('img', { name: 'Threshold exceeded history' });
    expect(chart.querySelectorAll('[data-chart-gap="time"]')).toHaveLength(1);
    expect(chart.querySelector('[data-chart-gap-seconds="121"]')).toBeDefined();
    expect(chart.querySelectorAll('[data-chart-series-id="gpu"]')).toHaveLength(0);
  });

  it('keeps utilization percentages pinned to a 0-100 chart range', () => {
    const renderableSeries = buildTimeSeries({
      height: 100,
      range: { min: 0, max: 100 },
      samples: [
        { receivedAt: '2026-06-04T00:00:00.000Z', gpuUtilizationPercent: 25 },
        { receivedAt: '2026-06-04T00:01:00.000Z', gpuUtilizationPercent: 75 }
      ],
      series: [{ id: 'gpu', label: 'GPU', metric: 'gpuUtilizationPercent' }],
      width: 100
    });

    expect(renderableSeries.at(0)?.points.map((point) => point.y)).toEqual([70, 30]);
  });

  it('uses data domains for temperature and power charts instead of percentage range', () => {
    const temperatureSeries = buildTimeSeries({
      height: 100,
      samples: [
        { receivedAt: '2026-06-04T00:00:00.000Z', temperatureCelsius: 40 },
        { receivedAt: '2026-06-04T00:01:00.000Z', temperatureCelsius: 80 }
      ],
      series: [{ id: 'temperature', label: 'Temperature', metric: 'temperatureCelsius' }],
      width: 100
    });
    const powerSeries = buildTimeSeries({
      height: 100,
      samples: [
        { receivedAt: '2026-06-04T00:00:00.000Z', powerDrawWatts: 125 },
        { receivedAt: '2026-06-04T00:01:00.000Z', powerDrawWatts: 250 }
      ],
      series: [{ id: 'power', label: 'Power', metric: 'powerDrawWatts' }],
      width: 100
    });

    expect(temperatureSeries.at(0)?.points.map((point) => point.y)).toEqual([90, 10]);
    expect(powerSeries.at(0)?.points.map((point) => point.y)).toEqual([90, 10]);
  });

});
