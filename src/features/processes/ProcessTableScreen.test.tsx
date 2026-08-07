import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessTableScreen } from './ProcessTableScreen';
import { summarizeProcessLedger } from './processTableModel';
import { listProcesses, refreshServer } from '../../lib/api';
import { makeProcessRow, processLedgerCollisionRows, processTableRows as processRows } from '../../test-utils/process-fixtures';
import { renderWithQueryClient } from '../../test-utils/query';
import { selectOptionValue, visibleTableBodyPids, visibleTableBodyRows } from '../../test-utils/dom';
import type { ProcessTableSortKey } from '../../lib/visibility';

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
const processLedgerSummary = () => screen.getByRole('region', { name: 'Process ledger summary' });
const processSortReachability = {
  command: { defaultAriaSort: 'ascending', initialState: 'not sorted', label: 'Command preview' },
  cpuPercent: { defaultAriaSort: 'descending', initialState: 'not sorted', label: 'CPU' },
  gpuIndex: { defaultAriaSort: 'ascending', initialState: 'not sorted', label: 'Context / GPU' },
  gpuMemoryUsedMiB: { defaultAriaSort: 'descending', initialState: 'descending', label: 'GPU memory' },
  gpuMemoryUtilizationPercent: { defaultAriaSort: 'descending', initialState: 'not sorted', label: 'Memory util' },
  gpuSmUtilizationPercent: { defaultAriaSort: 'descending', initialState: 'not sorted', label: 'SM util' },
  gpuUtilizationPercent: { defaultAriaSort: 'descending', initialState: 'not sorted', label: 'GPU util' },
  hostMemoryUsedMiB: { defaultAriaSort: 'descending', initialState: 'not sorted', label: 'Host memory' },
  pid: { defaultAriaSort: 'ascending', initialState: 'not sorted', label: 'Process / PID' },
  runtimeSeconds: { defaultAriaSort: 'descending', initialState: 'not sorted', label: 'Runtime' },
  serverName: { defaultAriaSort: 'ascending', initialState: 'not sorted', label: 'Context / Server' },
  username: { defaultAriaSort: 'ascending', initialState: 'not sorted', label: 'User' }
} satisfies Record<
  ProcessTableSortKey,
  {
  readonly defaultAriaSort: 'ascending' | 'descending';
  readonly initialState: 'descending' | 'not sorted';
  readonly label: string;
  }
>;
const processSortReachabilityCases = Object.values(processSortReachability);

const getUniqueSortButton = (label: string, state: 'ascending' | 'descending' | 'not sorted') => {
  const buttons = screen.getAllByRole('button', { name: `Sort ${label} ${state}` });
  expect(buttons).toHaveLength(1);
  const button = buttons[0];
  if (button === undefined) {
    throw new Error(`Expected one sort button for ${label}`);
  }
  return button;
};

const getColumnHeaderForSortButton = (label: string, state: 'ascending' | 'descending' | 'not sorted') => {
  const header = getUniqueSortButton(label, state).closest('th');
  if (!(header instanceof HTMLTableCellElement)) {
    throw new Error(`Expected ${label} sort control to be inside a table header`);
  }
  return header;
};

const sortHeaderLabels = () =>
  screen
    .getAllByRole('columnheader')
    .map((header) => (header.textContent ?? '').replace(/[↕↑↓]/g, '').trim());

const expectProcessLedgerSummary = async (expectedText: string) => {
  await waitFor(() => expect(processLedgerSummary().textContent).toContain(expectedText));
};

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

  it('renders a compact ledger summary with process rows and known memory state', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    const summary = await screen.findByRole('region', { name: 'Process ledger summary' });
    expect(summary.textContent).toContain('Showing 5 of 5 process rows');
    expect(summary.textContent).toContain('4 server IDs');
    expect(summary.textContent).toContain('5 GPU UUIDs');
    expect(summary.textContent).toContain('3 current / 2 stale');
    expect(summary.textContent).toContain('known memory 7,936 MiB');
    expect(summary.textContent).not.toMatch(/unique OS process/i);
  });

  it('updates the ledger summary for partial and unknown memory states', async () => {
    listProcessesMock.mockResolvedValue([
      makeProcessRow({ serverId: 'alpha', gpuUuid: 'GPU-alpha-0', pid: 101, gpuMemoryUsedMiB: 512 }),
      makeProcessRow({ serverId: 'beta', gpuUuid: 'GPU-beta-1', pid: 202, stale: true, gpuMemoryUsedMiB: null })
    ]);

    renderProcessTable();

    await expectProcessLedgerSummary('partial memory 512 MiB');
    fireEvent.change(screen.getByRole('combobox', { name: 'Freshness' }), { target: { value: 'stale' } });
    await expectProcessLedgerSummary('Showing 1 of 2 process rows');
    expect(processLedgerSummary().textContent).toContain('unknown memory');
  });

  it('switches from flat rows to parent grouped rows without inventing non-GPU parents', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
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

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    const viewSelect = screen.getByRole('combobox', { name: 'View' });
    expect(selectOptionValue(viewSelect, 'User grouped')).toBe('userGrouped');

    fireEvent.change(viewSelect, { target: { value: 'userGrouped' } });

    expect(screen.getByText('High memory host / unknown user')).toBeDefined();
    expect(screen.getByText('Low memory host / bob')).toBeDefined();
    expect(screen.getByText('Low memory host / carol')).toBeDefined();
    expect(visibleTableBodyRows()).toEqual([
      'Batch host / drew1 process',
      'sleep 30PID 4004staleBatch hostGPU 3 · GPU-batch-3drew0s256 MiB3.0%GPU 31.0%2.0%1.0%512 MiBsleep 30',
      'High memory host / unknown user1 process',
      'unknownPID 1001staleHigh memory hostGPU 0 · GPU-high-0unknownunknown4,096 MiBunknownGPU 0unknownunknownunknownunknownunknown',
      'Low memory host / bob1 process',
      'python worker.pyPID 2002currentLow memory hostGPU 1 · GPU-low-1bob1h 2m 3s512 MiB35.0%GPU 128.0%16.0%8.5%1,024 MiBpython worker.py',
      'Low memory host / carol1 process',
      'python trainer.py --token=[redacted]PID 3003Parent PID 2002currentLow memory hostGPU 0 · GPU-low-0carol1h 1m 1s1,024 MiB48.0%GPU 047.0%24.0%14.0%2,048 MiBpython trainer.py --token=[redacted]',
      'Render host / ada1 process',
      'blender --background scene.blendPID 1500Parent PID 1499currentRender hostGPU 2 · GPU-render-2ada59s2,048 MiB82.0%GPU 277.0%63.0%22.5%4,096 MiBblender --background scene.blend'
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

  it('renders a process ledger command strip with derived filters and reset behavior', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    expect(screen.getByRole('region', { name: 'Process ledger command strip' })).toBeDefined();

    const serverSelect = screen.getByRole('combobox', { name: 'Server' });
    const gpuSelect = screen.getByRole('combobox', { name: 'GPU' });
    const kindSelect = screen.getByRole('combobox', { name: 'Kind' });
    const staleSelect = screen.getByRole('combobox', { name: 'Freshness' });
    const viewSelect = screen.getByRole('combobox', { name: 'View' });
    const searchInput = screen.getByRole('textbox', { name: 'Search' });
    expect(screen.getByRole('button', { name: 'Refresh process rows' })).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'bob' } });
    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Low memory host (server-low)') } });
    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 1 · GPU-low-1') } });
    fireEvent.change(kindSelect, { target: { value: 'compute' } });
    fireEvent.change(staleSelect, { target: { value: 'current' } });
    fireEvent.change(viewSelect, { target: { value: 'userGrouped' } });
    fireEvent.click(screen.getByRole('button', { name: /sort process \/ pid not sorted/i }));

    await expectProcessLedgerSummary('Showing 1 of 5 process rows');
    expect(screen.getAllByRole('row', { name: /open process details/i })).toHaveLength(1);
    expect(visibleTableBodyRows().some((row) => row.includes('bob'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    expect(visibleTableBodyRows()[0]).toContain('High memory host');
    expect(searchInput).toHaveProperty('value', '');
    expect(serverSelect).toHaveProperty('value', 'all');
    expect(gpuSelect).toHaveProperty('value', 'all');
    expect(kindSelect).toHaveProperty('value', 'all');
    expect(staleSelect).toHaveProperty('value', 'all');
    expect(viewSelect).toHaveProperty('value', 'flat');
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('none');
    expect(screen.getByRole('columnheader', { name: /gpu memory/i }).getAttribute('aria-sort')).toBe('descending');
  });

  it('clears vanished server and GPU filter state so reintroduced options do not reactivate', async () => {
    const rowsWithoutSelectedOptions = processRows.filter((row) => row.serverId !== 'server-low');
    listProcessesMock.mockResolvedValueOnce(processRows).mockResolvedValueOnce(rowsWithoutSelectedOptions).mockResolvedValueOnce(processRows);
    renderProcessTable();

    const serverSelect = await screen.findByRole('combobox', { name: 'Server' });
    const gpuSelect = screen.getByRole('combobox', { name: 'GPU' });
    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Low memory host (server-low)') } });
    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 1 · GPU-low-1') } });
    await expectProcessLedgerSummary('Showing 1 of 5 process rows');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));
    expect(await screen.findByText(`Refresh rows loaded ${rowsWithoutSelectedOptions.length} local rows.`)).toBeDefined();
    await waitFor(() => expect(serverSelect).toHaveProperty('value', 'all'));
    await waitFor(() => expect(gpuSelect).toHaveProperty('value', 'all'));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));
    expect(await screen.findByText('Refresh rows loaded 5 local rows.')).toBeDefined();
    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    expect(serverSelect).toHaveProperty('value', 'all');
    expect(gpuSelect).toHaveProperty('value', 'all');
  });

  it('distinguishes duplicate server names and repeated server IDs in server filtering', async () => {
    listProcessesMock.mockResolvedValue(processLedgerCollisionRows);
    renderProcessTable();

    const serverSelect = await screen.findByRole('combobox', { name: 'Server' });
    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Shared Node (shared-a)') } });
    await expectProcessLedgerSummary('Showing 1 of 4 process rows');
    expect(visibleTableBodyRows()[0]).toContain('python shared-a.py');

    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Alias Node (shared-a)') } });
    await expectProcessLedgerSummary('Showing 1 of 4 process rows');
    expect(visibleTableBodyRows()[0]).toContain('python alias.py');
  });

  it('distinguishes duplicate GPU indices and repeated GPU UUIDs in GPU filtering', async () => {
    listProcessesMock.mockResolvedValue(processLedgerCollisionRows);
    renderProcessTable();

    const gpuSelect = await screen.findByRole('combobox', { name: 'GPU' });
    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 0 · GPU-shared-b') } });
    await expectProcessLedgerSummary('Showing 1 of 4 process rows');
    expect(visibleTableBodyRows()[0]).toContain('python shared-b.py');

    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 1 · GPU-repeated') } });
    await expectProcessLedgerSummary('Showing 1 of 4 process rows');
    expect(visibleTableBodyRows()[0]).toContain('python alias.py');
  });

  it('returns no rows for a cross-server exact server and GPU mismatch', async () => {
    listProcessesMock.mockResolvedValue(processLedgerCollisionRows);
    renderProcessTable();

    const serverSelect = await screen.findByRole('combobox', { name: 'Server' });
    const gpuSelect = screen.getByRole('combobox', { name: 'GPU' });
    fireEvent.change(serverSelect, { target: { value: selectOptionValue(serverSelect, 'Shared Node (shared-a)') } });
    fireEvent.change(gpuSelect, { target: { value: selectOptionValue(gpuSelect, 'GPU 0 · GPU-shared-b') } });

    await expectProcessLedgerSummary('Showing 0 of 4 process rows');
    expect(screen.getByText('No processes match filters')).toBeDefined();
  });

  it('refetches local read-model rows from Refresh rows while preserving filters, view, and sort', async () => {
    const refreshedRows = processRows.map((row) =>
      row.pid === 2002 ? { ...row, gpuMemoryUsedMiB: 768, command: 'python worker.py --token=next-secret' } : row
    );
    listProcessesMock.mockResolvedValueOnce(processRows).mockResolvedValueOnce(refreshedRows);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
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
    fireEvent.click(screen.getByRole('button', { name: /sort process \/ pid not sorted/i }));
    await expectProcessLedgerSummary('Showing 1 of 5 process rows');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));

    await waitFor(() => expect(listProcessesMock).toHaveBeenCalledTimes(2));
    expect(refreshServerMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Refresh rows loaded 5 local rows.')).toBeDefined();
    expect(processLedgerSummary().textContent).toContain('Showing 1 of 5 process rows');
    expect((searchInput as HTMLInputElement).value).toBe('bob');
    expect((serverSelect as HTMLSelectElement).value).toBe(selectOptionValue(serverSelect, 'Low memory host (server-low)'));
    expect((gpuSelect as HTMLSelectElement).value).toBe(selectOptionValue(gpuSelect, 'GPU 1 · GPU-low-1'));
    expect((kindSelect as HTMLSelectElement).value).toBe('compute');
    expect((staleSelect as HTMLSelectElement).value).toBe('current');
    expect((viewSelect as HTMLSelectElement).value).toBe('parentGrouped');
    expect(screen.getByRole('columnheader', { name: /pid/i }).getAttribute('aria-sort')).toBe('ascending');
    expect(visibleTableBodyRows()[0]).toContain('768 MiB');
    expect(visibleTableBodyRows()[0]).toContain('python worker.py --token=[redacted]');
    expect(visibleTableBodyRows()[0]).not.toContain('next-secret');
  });

  it('shows sanitized refresh failure feedback without hiding the header or toolbar', async () => {
    listProcessesMock
      .mockResolvedValueOnce(processRows)
      .mockRejectedValueOnce(new Error('SSH failed for /Users/alice/.ssh/id_ed25519 with --token secret-value'));

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));

    const alert = await screen.findByRole('alert', { name: 'Process row refresh' });
    expect(alert.textContent).toContain('Refresh rows failed: SSH failed for [path redacted] with --token=[redacted]');
    expect(alert.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(alert.textContent).not.toContain('secret-value');
    expect(screen.getByText('Process Table')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Process ledger command strip' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Refresh process rows' })).toBeDefined();
    expect(processLedgerSummary().textContent).toContain('Showing 5 of 5 process rows');
    expect(visibleTableBodyPids()).toEqual(['1001', '1500', '3003', '2002', '4004']);
    expect(refreshServerMock).not.toHaveBeenCalled();
  });

  it('keeps cached process rows visible while refresh is pending', async () => {
    let completeRefresh: (rows: typeof processRows) => void = (_rows) => {
      throw new Error('Expected refresh resolver to be initialized');
    };
    const refreshPromise = new Promise<typeof processRows>((resolve) => {
      completeRefresh = resolve;
    });
    listProcessesMock.mockResolvedValueOnce(processRows).mockReturnValueOnce(refreshPromise);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));

    expect(await screen.findByText('Process row refresh pending')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Refresh process rows' })).toHaveProperty('disabled', true);
    expect(visibleTableBodyPids()).toEqual(['1001', '1500', '3003', '2002', '4004']);

    await act(async () => {
      completeRefresh(processRows);
      await refreshPromise;
    });
    expect(await screen.findByText('Refresh rows loaded 5 local rows.')).toBeDefined();
  });

  it('shows a filtered empty state distinct from the no-processes state', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    fireEvent.change(await screen.findByRole('textbox', { name: 'Search' }), { target: { value: 'supersecret' } });

    await expectProcessLedgerSummary('Showing 0 of 5 process rows');
    expect(screen.getByText('No processes match filters')).toBeDefined();
    expect(screen.queryByText('No processes')).toBeNull();
    const resetButtons = screen.getAllByRole('button', { name: 'Reset filters' });
    const filteredEmptyReset = resetButtons[1];
    if (filteredEmptyReset === undefined) {
      throw new Error('Expected filtered empty state to provide a reset button');
    }
    fireEvent.click(filteredEmptyReset);
    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
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

  it('renders a modal inspector with full sanitized command and blocks background row activation', async () => {
    const inspectedRow = makeProcessRow({
      serverId: 'inspector-host',
      serverName: 'Inspector host',
      gpuUuid: 'GPU-inspector-0',
      pid: 9100,
      command: `python trainer.py --token=supersecret ${'x'.repeat(140)} safe-tail-marker /Users/alice/.ssh/id_ed25519`,
      gpuMemoryUsedMiB: 8192
    });
    const backgroundRow = makeProcessRow({
      serverId: 'background-host',
      serverName: 'Background host',
      gpuUuid: 'GPU-background-0',
      pid: 9200,
      command: 'python background.py',
      gpuMemoryUsedMiB: 4096
    });
    listProcessesMock.mockResolvedValue([inspectedRow, backgroundRow]);

    renderProcessTable();

    fireEvent.click(await screen.findByRole('row', { name: /open process details for pid 9100/i }));

    const drawer = screen.getByRole('dialog', { name: 'Process details' });
    expect(drawer.textContent).toContain('PID 9100');
    expect(drawer.textContent).toContain('Inspector host / GPU 0');
    expect(within(drawer).getByRole('region', { name: 'Runtime' })).toBeDefined();
    expect(within(drawer).getByRole('region', { name: 'GPU metrics' })).toBeDefined();
    expect(within(drawer).getByRole('region', { name: 'Host metrics' })).toBeDefined();
    expect(within(drawer).getByRole('region', { name: 'Full command' }).textContent).toContain('safe-tail-marker');
    expect(drawer.textContent).toContain('--token=[redacted]');
    expect(drawer.textContent).toContain('[path redacted]');
    expect(drawer.textContent).not.toContain('supersecret');
    expect(drawer.textContent).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(within(drawer).queryByRole('button', { name: /kill|terminate|signal|interrupt|restart|refresh|copy/i })).toBeNull();

    fireEvent.click(screen.getByRole('row', { name: /open process details for pid 9200/i }));

    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('PID 9100');
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).not.toContain('PID 9200');
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

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    const firstRow = screen.getByRole('row', { name: /open process details for pid 1001/i });
    const secondRow = screen.getByRole('row', { name: /open process details for pid 1500/i });

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(secondRow);

    const querySelectorSpy = vi.spyOn(document, 'querySelector');
    fireEvent.keyDown(secondRow, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('PID 1500');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close drawer' }));
    const usedGlobalCloseButtonQuery = querySelectorSpy.mock.calls.some(([selector]) => selector === '[aria-label="Close drawer"]');
    querySelectorSpy.mockRestore();
    expect(usedGlobalCloseButtonQuery).toBe(false);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(secondRow));
  });

  it('uses composite row identity for colliding-PID navigation, drawer selection, and focus return', async () => {
    listProcessesMock.mockResolvedValue(processLedgerCollisionRows);
    renderProcessTable();

    await expectProcessLedgerSummary('Showing 4 of 4 process rows');
    const processRowElements = screen.getAllByRole('row', { name: /open process details/i });
    const firstRow = processRowElements[0];
    const secondRow = processRowElements[1];
    if (firstRow === undefined || secondRow === undefined) {
      throw new Error('Expected at least two focusable process rows');
    }

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(secondRow);
    fireEvent.keyDown(secondRow, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('GPU-shared-b');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(secondRow));
  });

  it('blocks background refresh while the drawer is open and refreshes after close', async () => {
    const refreshedRows = processLedgerCollisionRows.map((row) => ({ ...row, command: `${row.command} refreshed` }));
    listProcessesMock.mockResolvedValueOnce(processLedgerCollisionRows).mockResolvedValueOnce(refreshedRows);
    renderProcessTable();

    const betaRow = await screen.findByRole('row', { name: 'Open process details for PID 700 on Beta Node' });
    betaRow.focus();
    fireEvent.click(betaRow);
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('GPU-repeated');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));
    expect(listProcessesMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Refresh rows loaded 4 local rows.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(document.activeElement).toBe(betaRow));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));

    expect(await screen.findByText('Refresh rows loaded 4 local rows.')).toBeDefined();
    const refreshedBetaRow = screen.getByRole('row', { name: 'Open process details for PID 700 on Beta Node' });
    fireEvent.click(refreshedBetaRow);
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('python beta.py refreshed');
  });

  it('keeps the drawer open when background refresh is clicked through the modal', async () => {
    const refreshedRows = processRows.filter((row) => row.pid !== 3003);
    listProcessesMock.mockResolvedValueOnce(processRows).mockResolvedValueOnce(refreshedRows);
    renderProcessTable();

    fireEvent.click(await screen.findByRole('row', { name: /open process details for pid 3003/i }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close drawer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh process rows' }));

    expect(listProcessesMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(`Refresh rows loaded ${refreshedRows.length} local rows.`)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Process details' }).textContent).toContain('PID 3003');
  });

  it('supports ArrowUp movement and Space activation on visible rows', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
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

    await expectProcessLedgerSummary('Showing 1 of 5 process rows');
    expect(screen.queryByRole('dialog', { name: 'Process details' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'GPU memory ledger' })));
  });

  it('renders six primary ledger headers and exposes every process sort key exactly once in table overflow', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    expect(sortHeaderLabels().slice(0, 6)).toEqual(['Process / PID', 'Context / Server', 'User', 'Runtime', 'GPU memory', 'GPU util']);

    for (const sortCase of processSortReachabilityCases) {
      const header = getColumnHeaderForSortButton(sortCase.label, sortCase.initialState);
      expect(header.getAttribute('aria-sort')).toBe(sortCase.initialState === 'descending' ? 'descending' : 'none');
      expect(getUniqueSortButton(sortCase.label, sortCase.initialState).closest('.panel')).toHaveProperty('scrollWidth');
    }

    expect(screen.getAllByRole('button', { name: /^Sort / })).toHaveLength(processSortReachabilityCases.length);
  });

  it('toggles sortable headers and keeps text and metric default directions', async () => {
    listProcessesMock.mockResolvedValue(processRows);

    renderProcessTable();

    await expectProcessLedgerSummary('Showing 5 of 5 process rows');
    expect(visibleTableBodyRows()[0]).toContain('High memory host');

    fireEvent.click(getUniqueSortButton('Process / PID', 'not sorted'));
    expect(getColumnHeaderForSortButton('Process / PID', 'ascending').getAttribute('aria-sort')).toBe('ascending');
    expect(visibleTableBodyRows()[0]).toContain('High memory host');

    fireEvent.click(getUniqueSortButton('Process / PID', 'ascending'));
    expect(getColumnHeaderForSortButton('Process / PID', 'descending').getAttribute('aria-sort')).toBe('descending');
    expect(visibleTableBodyRows()[0]).toContain('Batch host');

    fireEvent.click(getUniqueSortButton('Context / Server', 'not sorted'));
    expect(getColumnHeaderForSortButton('Context / Server', 'ascending').getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(getUniqueSortButton('Command preview', 'not sorted'));
    expect(getColumnHeaderForSortButton('Command preview', 'ascending').getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(getUniqueSortButton('GPU util', 'not sorted'));
    expect(getColumnHeaderForSortButton('GPU util', 'descending').getAttribute('aria-sort')).toBe('descending');

    fireEvent.click(getUniqueSortButton('GPU memory', 'not sorted'));
    expect(getColumnHeaderForSortButton('GPU memory', 'descending').getAttribute('aria-sort')).toBe('descending');
    expect(visibleTableBodyRows()[0]).toContain('High memory host');
  });

  it('summarizes visible process rows without de-duplicating a multi-GPU PID', () => {
    const rows = [
      makeProcessRow({ serverId: 'alpha', gpuUuid: 'GPU-alpha-0', pid: 700, gpuMemoryUsedMiB: 100 }),
      makeProcessRow({ serverId: 'alpha', gpuUuid: 'GPU-alpha-1', pid: 700, gpuMemoryUsedMiB: 200 }),
      makeProcessRow({ serverId: 'beta', gpuUuid: 'GPU-alpha-1', pid: 700, stale: true, gpuMemoryUsedMiB: 300 })
    ];

    const summary = summarizeProcessLedger(rows, rows.filter((row) => row.serverId === 'alpha'));

    expect(summary).toEqual({
      totalProcessRowCount: 3,
      visibleProcessRowCount: 2,
      uniqueServerIdCount: 1,
      uniqueGpuUuidCount: 2,
      currentProcessRowCount: 2,
      staleProcessRowCount: 0,
      gpuMemoryUsedMiB: 300,
      memoryStatus: 'known'
    });
  });

  it('reports partial memory when visible rows mix known and null values', () => {
    const rows = [makeProcessRow({ gpuMemoryUsedMiB: 512 }), makeProcessRow({ stale: true, gpuUuid: 'GPU-alpha-1', gpuMemoryUsedMiB: null })];

    const summary = summarizeProcessLedger(rows, rows);

    expect(summary.gpuMemoryUsedMiB).toBe(512);
    expect(summary.memoryStatus).toBe('partial');
    expect(summary.currentProcessRowCount).toBe(1);
    expect(summary.staleProcessRowCount).toBe(1);
  });

  it('reports all-null visible memory as unknown rather than zero', () => {
    const rows = [makeProcessRow({ gpuMemoryUsedMiB: null }), makeProcessRow({ gpuUuid: 'GPU-alpha-1', gpuMemoryUsedMiB: null })];

    const summary = summarizeProcessLedger(rows, rows);

    expect(summary.gpuMemoryUsedMiB).toBeNull();
    expect(summary.memoryStatus).toBe('unknown');
  });
});
