import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
    username: 'bob',
    command: 'python worker.py',
    gpuMemoryUsedMiB: 512,
    gpuUtilizationPercent: 35,
    cpuPercent: 8.5,
    hostMemoryUsedMiB: 1024
  },
  {
    serverId: 'server-high',
    serverName: 'High memory host',
    stale: true,
    gpuIndex: 0,
    pid: 1001,
    username: null,
    command: null,
    gpuMemoryUsedMiB: 4096,
    gpuUtilizationPercent: null,
    cpuPercent: null,
    hostMemoryUsedMiB: null
  }
];

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
    const hostCells = screen.getAllByText(/memory host/);
    expect(hostCells.map((cell) => cell.textContent)).toEqual(['High memory host', 'Low memory host']);
    expect(screen.getByText('stale')).toBeDefined();
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(4);
  });
});
