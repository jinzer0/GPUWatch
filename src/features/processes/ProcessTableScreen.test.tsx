import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessTableScreen } from './ProcessTableScreen';
import { listProcesses } from '../../lib/api';
import type { ProcessRowDto } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  listProcesses: vi.fn(),
  queryKeys: {
    processes: ['processes']
  }
}));

const listProcessesMock = vi.mocked(listProcesses);

const renderProcessTable = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProcessTableScreen />
    </QueryClientProvider>
  );
};

const processRows: ProcessRowDto[] = [
  {
    serverId: 'server-low',
    serverName: 'Low memory host',
    stale: false,
    gpuIndex: 1,
    pid: 2002,
    parentPid: null,
    runtimeSeconds: 3723,
    username: 'bob',
    command: 'python worker.py',
    gpuUuid: 'GPU-low-1',
    processKind: 'compute',
    gpuMemoryUsedMiB: 512,
    gpuUtilizationPercent: 35,
    gpuSmUtilizationPercent: 28,
    gpuMemoryUtilizationPercent: 16,
    gpuEncoderUtilizationPercent: 0,
    gpuDecoderUtilizationPercent: 0,
    cpuPercent: 8.5,
    hostMemoryUsedMiB: 1024
  },
  {
    serverId: 'server-high',
    serverName: 'High memory host',
    stale: true,
    gpuIndex: 0,
    pid: 1001,
    parentPid: null,
    runtimeSeconds: null,
    username: null,
    command: null,
    gpuUuid: 'GPU-high-0',
    processKind: 'unknown',
    gpuMemoryUsedMiB: 4096,
    gpuUtilizationPercent: null,
    gpuSmUtilizationPercent: null,
    gpuMemoryUtilizationPercent: null,
    gpuEncoderUtilizationPercent: null,
    gpuDecoderUtilizationPercent: null,
    cpuPercent: null,
    hostMemoryUsedMiB: null
  },
  {
    serverId: 'server-render',
    serverName: 'Render host',
    stale: false,
    gpuIndex: 2,
    pid: 1500,
    parentPid: 1499,
    runtimeSeconds: 59,
    username: 'ada',
    command: 'blender --background scene.blend',
    gpuUuid: 'GPU-render-2',
    processKind: 'graphics',
    gpuMemoryUsedMiB: 2048,
    gpuUtilizationPercent: 82,
    gpuSmUtilizationPercent: 77,
    gpuMemoryUtilizationPercent: 63,
    gpuEncoderUtilizationPercent: 11,
    gpuDecoderUtilizationPercent: 12,
    cpuPercent: 22.5,
    hostMemoryUsedMiB: 4096
  },
  {
    serverId: 'server-low',
    serverName: 'Low memory host',
    stale: false,
    gpuIndex: 0,
    pid: 3003,
    parentPid: 2002,
    runtimeSeconds: 3661,
    username: 'carol',
    command: 'python trainer.py --token=supersecret',
    gpuUuid: 'GPU-low-0',
    processKind: 'compute',
    gpuMemoryUsedMiB: 1024,
    gpuUtilizationPercent: 48,
    gpuSmUtilizationPercent: 47,
    gpuMemoryUtilizationPercent: 24,
    gpuEncoderUtilizationPercent: null,
    gpuDecoderUtilizationPercent: 2,
    cpuPercent: 14,
    hostMemoryUsedMiB: 2048
  },
  {
    serverId: 'server-batch',
    serverName: 'Batch host',
    stale: true,
    gpuIndex: 3,
    pid: 4004,
    parentPid: null,
    runtimeSeconds: 0,
    username: 'drew',
    command: 'sleep 30',
    gpuUuid: 'GPU-batch-3',
    processKind: 'utility',
    gpuMemoryUsedMiB: 256,
    gpuUtilizationPercent: 3,
    gpuSmUtilizationPercent: 1,
    gpuMemoryUtilizationPercent: 2,
    gpuEncoderUtilizationPercent: 3,
    gpuDecoderUtilizationPercent: 4,
    cpuPercent: 1,
    hostMemoryUsedMiB: 512
  }
];

const visibleBodyRows = () => screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');

const visibleBodyPids = () => screen.getAllByRole('row').slice(1).map((row) => row.getAttribute('aria-label')?.match(/PID (\d+)/)?.[1]);

const selectOptionValue = (select: HTMLElement, label: string) => {
  const option = Array.from((select as HTMLSelectElement).options).find((item) => item.textContent === label);
  expect(option).toBeDefined();
  return option?.value ?? '';
};

describe('ProcessTableScreen', () => {
  beforeEach(() => {
    listProcessesMock.mockReset();
  });

  it('keeps the screen identity visible when the process API fails', async () => {
    listProcessesMock.mockRejectedValue(new Error("Cannot read properties of undefined (reading 'invoke')"));

    renderProcessTable();

    expect(screen.getByText('Process Table')).toBeDefined();
    expect(screen.getByText('GPU memory ledger')).toBeDefined();
    expect(await screen.findByText("Cannot read properties of undefined (reading 'invoke')")).toBeDefined();
  });

  it('keeps the screen identity visible while loading process rows', () => {
    listProcessesMock.mockReturnValue(new Promise(() => undefined));

    renderProcessTable();

    expect(screen.getByText('Process Table')).toBeDefined();
    expect(screen.getByText('GPU memory ledger')).toBeDefined();
    expect(screen.getByText('Loading process DTO rows...')).toBeDefined();
  });

  it('renders the empty process state below the persistent header', async () => {
    listProcessesMock.mockResolvedValue([]);

    renderProcessTable();

    expect(screen.getByText('Process Table')).toBeDefined();
    expect(await screen.findByText('No processes')).toBeDefined();
  });

  it('renders process rows sorted by GPU memory below the persistent header', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    expect(screen.getByText('Process Table')).toBeDefined();
    expect(await screen.findByText('High memory host')).toBeDefined();
    const memoryHostRows = visibleBodyRows().filter((row) => row.includes('memory host'));
    expect(memoryHostRows[0]).toContain('High memory host');
    expect(memoryHostRows[1]).toContain('Low memory host');
    expect(memoryHostRows[2]).toContain('Low memory host');
    expect(screen.getAllByText('stale')).toHaveLength(2);
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('columnheader', { name: /runtime/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /sm util/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /memory util/i })).toBeDefined();
    expect(visibleBodyRows()[1]).toContain('Parent PID 1499');
    expect(visibleBodyRows()[1]).toContain('59s');
    expect(visibleBodyRows()[1]).toContain('77.0%');
    expect(visibleBodyRows()[1]).toContain('63.0%');
  });

  it('switches from flat rows to parent grouped rows without inventing non-GPU parents', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(visibleBodyPids()).toEqual(['1001', '1500', '3003', '2002', '4004']);

    fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: 'parentGrouped' } });

    const groupedRows = visibleBodyRows();
    expect(visibleBodyPids()).toEqual(['1001', '1500', '2002', '3003', '4004']);
    expect(groupedRows[1]).toContain('Parent PID 1499');
    expect(groupedRows[2]).not.toContain('Parent PID');
    expect(groupedRows[3]).toContain('Parent PID 2002');
    expect(screen.queryByText('PID 1499')).toBeNull();
  });

  it('renders an inline toolbar with derived filters and reset behavior', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(screen.getByText('Process filters')).toBeDefined();

    const serverSelect = screen.getByRole('combobox', { name: 'Server' });
    const gpuSelect = screen.getByRole('combobox', { name: 'GPU' });
    const kindSelect = screen.getByRole('combobox', { name: 'Kind' });
    const staleSelect = screen.getByRole('combobox', { name: 'Freshness' });

    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Low memory host (server-low)') } });
    expect(await screen.findByText('Showing 2 of 5 processes')).toBeDefined();

    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 1 · GPU-low-1') } });
    fireEvent.change(kindSelect, { target: { value: 'compute' } });
    fireEvent.change(staleSelect, { target: { value: 'current' } });

    expect(await screen.findByText('Showing 1 of 5 processes')).toBeDefined();
    expect(visibleBodyRows()).toHaveLength(1);
    expect(visibleBodyRows()[0]).toContain('bob');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(visibleBodyRows()[0]).toContain('High memory host');
  });

  it('shows a filtered empty state distinct from the no-processes state', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    fireEvent.change(await screen.findByRole('textbox', { name: 'Search' }), { target: { value: 'supersecret' } });

    expect(await screen.findByText('Showing 0 of 5 processes')).toBeDefined();
    expect(screen.getByText('No processes match filters')).toBeDefined();
    expect(screen.queryByText('No processes')).toBeNull();
  });


  it('opens a read-only process detail drawer from row click with formatted sanitized fields and close behavior', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    const trainerRow = await screen.findByRole('row', { name: /open process details for pid 3003/i });
    fireEvent.click(trainerRow);

    const drawer = screen.getByRole('dialog', { name: 'Process details' });
    expect(drawer.textContent).toContain('Low memory host');
    expect(drawer.textContent).toContain('current');
    expect(drawer.textContent).toContain('GPU 0');
    expect(drawer.textContent).toContain('GPU-low-0');
    expect(drawer.textContent).toContain('3003');
    expect(drawer.textContent).toContain('2002');
    expect(drawer.textContent).toContain('1h 1m 1s');
    expect(drawer.textContent).toContain('carol');
    expect(drawer.textContent).toContain('compute');
    expect(drawer.textContent).toContain('1,024 MiB');
    expect(drawer.textContent).toContain('48.0%');
    expect(drawer.textContent).toContain('47.0%');
    expect(drawer.textContent).toContain('24.0%');
    expect(drawer.textContent).toContain('2.0%');
    expect(drawer.textContent).toContain('14.0%');
    expect(drawer.textContent).toContain('2,048 MiB');
    expect(drawer.textContent).toContain('python trainer.py --token=[redacted]');
    expect(drawer.textContent).toContain('Read-only view; no process actions are available.');
    expect(drawer.textContent).not.toContain('supersecret');
    expect(screen.queryByRole('button', { name: /kill|terminate|interrupt/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull();
  });

  it('opens the process detail drawer from keyboard activation and formats null values as unknown', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    const highMemoryRow = await screen.findByRole('row', { name: /open process details for pid 1001/i });
    fireEvent.keyDown(highMemoryRow, { key: 'Enter' });

    const drawer = screen.getByRole('dialog', { name: 'Process details' });
    expect(drawer.textContent).toContain('High memory host');
    expect(drawer.textContent).toContain('stale');
    expect(drawer.textContent).toContain('GPU 0');
    expect(drawer.textContent).toContain('GPU-high-0');
    expect(drawer.textContent).toContain('1001');
    expect(drawer.textContent).toContain('unknown');
    expect((drawer.textContent?.match(/unknown/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('moves keyboard focus across visible rows, opens with Enter, and returns focus after Escape', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await screen.findByText('Showing 5 of 5 processes');
    const firstRow = screen.getByRole('row', { name: /open process details for pid 1001/i });
    const secondRow = screen.getByRole('row', { name: /open process details for pid 1500/i });

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(secondRow);

    fireEvent.keyDown(secondRow, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('PID 1500');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close drawer' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(secondRow));
  });

  it('supports ArrowUp movement and Space activation on visible rows', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await screen.findByText('Showing 5 of 5 processes');
    const firstRow = screen.getByRole('row', { name: /open process details for pid 1001/i });
    const secondRow = screen.getByRole('row', { name: /open process details for pid 1500/i });

    secondRow.focus();
    fireEvent.keyDown(secondRow, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(firstRow);

    fireEvent.keyDown(firstRow, { key: ' ' });
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('PID 1001');
  });

  it('closes the process detail drawer when filters remove the selected row', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    fireEvent.click(await screen.findByRole('row', { name: /open process details for pid 3003/i }));
    expect(screen.getByRole('dialog', { name: 'Process details' })).toBeDefined();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'blender' } });

    expect(await screen.findByText('Showing 1 of 5 processes')).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull();
  });

  it('toggles sortable headers and defaults metric columns to descending', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(visibleBodyRows()[0]).toContain('High memory host');

    fireEvent.click(screen.getByRole('button', { name: /sort pid not sorted/i }));
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('ascending');
    expect(visibleBodyRows()[0]).toContain('High memory host');

    fireEvent.click(screen.getByRole('button', { name: /sort pid ascending/i }));
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('descending');
    expect(visibleBodyRows()[0]).toContain('Batch host');

    fireEvent.click(screen.getByRole('button', { name: /sort gpu memory not sorted/i }));
    expect(screen.getByRole('columnheader', { name: /gpu memory/i }).getAttribute('aria-sort')).toBe('descending');
    expect(visibleBodyRows()[0]).toContain('High memory host');
  });
});
