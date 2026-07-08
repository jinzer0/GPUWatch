import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessTableScreen } from './ProcessTableScreen';
import { listProcesses, refreshServer } from '../../lib/api';
import { processTableRows as processRows } from '../../test-utils/process-fixtures';
import { renderWithQueryClient } from '../../test-utils/query';
import { selectOptionValue, visibleTableBodyPids, visibleTableBodyRows } from '../../test-utils/dom';

vi.mock('../../lib/api', () => ({
  listProcesses: vi.fn(),
  queryKeys: {
    processes: ['processes']
  },
  refreshServer: vi.fn()
}));

const listProcessesMock = vi.mocked(listProcesses);
const refreshServerMock = vi.mocked(refreshServer);

const renderProcessTable = () => renderWithQueryClient(<ProcessTableScreen />);

describe('ProcessTableScreen', () => {
  beforeEach(() => {
    listProcessesMock.mockReset();
    refreshServerMock.mockReset();
  });

  it('keeps the screen identity visible when the process API fails', async () => {
    listProcessesMock.mockRejectedValue(new Error('GPUWatcher backend is unavailable. Launch the desktop app to use this action.'));

    renderProcessTable();

    expect(screen.getByText('Process Table')).toBeDefined();
    expect(screen.getByText('GPU memory ledger')).toBeDefined();
    expect(await screen.findByText('GPUWatcher backend is unavailable. Launch the desktop app to use this action.')).toBeDefined();
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
    const memoryHostRows = visibleTableBodyRows().filter((row) => row.includes('memory host'));
    expect(memoryHostRows[0]).toContain('High memory host');
    expect(memoryHostRows[1]).toContain('Low memory host');
    expect(memoryHostRows[2]).toContain('Low memory host');
    expect(screen.getAllByText('stale')).toHaveLength(2);
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('columnheader', { name: /runtime/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /sm util/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /memory util/i })).toBeDefined();
    expect(visibleTableBodyRows()[1]).toContain('Parent PID 1499');
    expect(visibleTableBodyRows()[1]).toContain('59s');
    expect(visibleTableBodyRows()[1]).toContain('77.0%');
    expect(visibleTableBodyRows()[1]).toContain('63.0%');
  });

  it('switches from flat rows to parent grouped rows without inventing non-GPU parents', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(visibleTableBodyPids()).toEqual(['1001', '1500', '3003', '2002', '4004']);

    fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: 'parentGrouped' } });

    const groupedRows = visibleTableBodyRows();
    expect(visibleTableBodyPids()).toEqual(['1001', '1500', '2002', '3003', '4004']);
    expect(groupedRows[1]).toContain('Parent PID 1499');
    expect(groupedRows[2]).not.toContain('Parent PID');
    expect(groupedRows[3]).toContain('Parent PID 2002');
    expect(screen.queryByText('PID 1499')).toBeNull();
  });

  it('switches to user grouped rows with non-clickable section headers and can return to parent grouped rows', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    const viewSelect = screen.getByRole('combobox', { name: 'View' });
    expect(selectOptionValue(viewSelect, 'User grouped')).toBe('userGrouped');

    fireEvent.change(viewSelect, { target: { value: 'userGrouped' } });

    expect(screen.getByText('High memory host / unknown user')).toBeDefined();
    expect(screen.getByText('Low memory host / bob')).toBeDefined();
    expect(screen.getByText('Low memory host / carol')).toBeDefined();
    expect(visibleTableBodyRows()).toEqual([
      'Batch host / drew1 process',
      'Batch hoststale340040sdrew256 MiB3.0%1.0%2.0%1.0%512 MiBsleep 30',
      'High memory host / unknown user1 process',
      'High memory hoststale01001unknownunknown4,096 MiBunknownunknownunknownunknownunknownunknown',
      'Low memory host / bob1 process',
      'Low memory host120021h 2m 3sbob512 MiB35.0%28.0%16.0%8.5%1,024 MiBpython worker.py',
      'Low memory host / carol1 process',
      'Low memory host03003Parent PID 20021h 1m 1scarol1,024 MiB48.0%47.0%24.0%14.0%2,048 MiBpython trainer.py --token=[redacted]',
      'Render host / ada1 process',
      'Render host21500Parent PID 149959sada2,048 MiB82.0%77.0%63.0%22.5%4,096 MiBblender --background scene.blend'
    ]);

    const sectionHeader = screen.getByText('High memory host / unknown user').closest('tr');
    expect(sectionHeader).not.toBeNull();
    if (sectionHeader === null) {
      throw new Error('Expected user group section header row');
    }
    expect(sectionHeader.getAttribute('aria-label')).toBeNull();
    expect(sectionHeader.getAttribute('tabindex')).toBeNull();
    fireEvent.click(sectionHeader);
    expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull();

    fireEvent.click(screen.getByRole('row', { name: /open process details for pid 1001/i }));
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('PID 1001');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));

    fireEvent.change(viewSelect, { target: { value: 'parentGrouped' } });
    expect(visibleTableBodyPids()).toEqual(['1001', '1500', '2002', '3003', '4004']);
    expect(screen.queryByText('High memory host / unknown user')).toBeNull();
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
    expect(visibleTableBodyRows()).toHaveLength(1);
    expect(visibleTableBodyRows()[0]).toContain('bob');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(visibleTableBodyRows()[0]).toContain('High memory host');
  });

  it('refetches local read-model rows from Refresh rows while preserving filters, view, sort, and selected drawer', async () => {
    const refreshedRows = processRows.map((row) =>
      row.pid === 2002 ? { ...row, gpuMemoryUsedMiB: 768, command: 'python worker.py --token=next-secret' } : row
    );
    listProcessesMock.mockResolvedValueOnce(processRows).mockResolvedValueOnce(refreshedRows);

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();
    expect(listProcessesMock).toHaveBeenCalledTimes(1);

    const serverSelect = screen.getByRole('combobox', { name: 'Server' });
    const gpuSelect = screen.getByRole('combobox', { name: 'GPU' });
    const kindSelect = screen.getByRole('combobox', { name: 'Kind' });
    const staleSelect = screen.getByRole('combobox', { name: 'Freshness' });
    const viewSelect = screen.getByRole('combobox', { name: 'View' });
    const searchInput = screen.getByRole('textbox', { name: 'Search' });

    fireEvent.change(searchInput, { target: { value: 'bob' } });
    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Low memory host (server-low)') } });
    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 1 · GPU-low-1') } });
    fireEvent.change(kindSelect, { target: { value: 'compute' } });
    fireEvent.change(staleSelect, { target: { value: 'current' } });
    fireEvent.change(viewSelect, { target: { value: 'parentGrouped' } });
    fireEvent.click(screen.getByRole('button', { name: /sort pid not sorted/i }));
    fireEvent.click(screen.getByRole('row', { name: /open process details for pid 2002/i }));

    expect(await screen.findByText('Showing 1 of 5 processes')).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('512 MiB');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh rows' }));

    await waitFor(() => expect(listProcessesMock).toHaveBeenCalledTimes(2));
    expect(refreshServerMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Refresh rows loaded 5 local rows.')).toBeDefined();
    expect(screen.getByText('Showing 1 of 5 processes')).toBeDefined();
    expect((searchInput as HTMLInputElement).value).toBe('bob');
    expect((serverSelect as HTMLSelectElement).value).toBe(selectOptionValue(serverSelect, 'Low memory host (server-low)'));
    expect((gpuSelect as HTMLSelectElement).value).toBe(selectOptionValue(gpuSelect, 'GPU 1 · GPU-low-1'));
    expect((kindSelect as HTMLSelectElement).value).toBe('compute');
    expect((staleSelect as HTMLSelectElement).value).toBe('current');
    expect((viewSelect as HTMLSelectElement).value).toBe('parentGrouped');
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('ascending');
    const drawer = screen.getByRole('dialog', { name: 'Process details' });
    expect(drawer.textContent).toContain('PID 2002');
    expect(drawer.textContent).toContain('768 MiB');
    expect(drawer.textContent).toContain('python worker.py --token=[redacted]');
    expect(drawer.textContent).not.toContain('next-secret');
  });

  it('shows sanitized refresh failure feedback without hiding the header or toolbar', async () => {
    listProcessesMock
      .mockResolvedValueOnce(processRows)
      .mockRejectedValueOnce(new Error('SSH failed for /Users/alice/.ssh/id_ed25519 with --token secret-value'));

    renderProcessTable();

    expect(await screen.findByText('Showing 5 of 5 processes')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh rows' }));

    const alert = await screen.findByRole('alert', { name: 'Process row refresh' });
    expect(alert.textContent).toContain('Refresh rows failed: SSH failed for [path redacted] with --token=[redacted]');
    expect(alert.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(alert.textContent).not.toContain('secret-value');
    expect(screen.getByText('Process Table')).toBeDefined();
    expect(screen.getByText('Process filters')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Refresh rows' })).toBeDefined();
    expect(screen.getByText('Showing 5 of 5 processes')).toBeDefined();
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
    expect(visibleTableBodyRows()[0]).toContain('High memory host');

    fireEvent.click(screen.getByRole('button', { name: /sort pid not sorted/i }));
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('ascending');
    expect(visibleTableBodyRows()[0]).toContain('High memory host');

    fireEvent.click(screen.getByRole('button', { name: /sort pid ascending/i }));
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('descending');
    expect(visibleTableBodyRows()[0]).toContain('Batch host');

    fireEvent.click(screen.getByRole('button', { name: /sort gpu memory not sorted/i }));
    expect(screen.getByRole('columnheader', { name: /gpu memory/i }).getAttribute('aria-sort')).toBe('descending');
    expect(visibleTableBodyRows()[0]).toContain('High memory host');
  });
});
