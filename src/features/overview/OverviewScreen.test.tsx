import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OverviewScreen } from './OverviewScreen';
import { useUiStore } from '../../lib/store';
import type { ConnectionTestResultDto, ServerOverviewDto } from '../../lib/types';

const apiMocks = vi.hoisted(() => ({
  queryKeys: { detail: (id: string) => ['server-detail', id] as const, gpuHistory: (serverId: string | null | undefined, gpuIndex: number | null | undefined, gpuUuid: string | null | undefined, range: string) => ['gpu-history', serverId ?? null, gpuIndex ?? null, gpuUuid ?? null, range] as const, overview: ['overview'] as const, processes: ['processes'] as const, servers: ['servers'] as const },
  refreshServer: vi.fn(),
  seedDemoData: vi.fn()
}));

vi.mock('../../lib/api', () => ({
  queryKeys: apiMocks.queryKeys,
  refreshServer: apiMocks.refreshServer,
  seedDemoData: apiMocks.seedDemoData
}));

const overviewRows: ServerOverviewDto[] = [
  {
    id: 'server-1',
    name: 'Demo GPU Server',
    host: 'demo.local',
    status: 'stale',
    gpuTotal: 2,
    busyGpuCount: 1,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: 42,
    averageMemoryUsagePercent: 55.5,
    maxTemperatureCelsius: 69,
    lastSuccessAt: '2026-06-01T00:00:00Z',
    lastErrorType: 'ssh_timeout',
    lastErrorMessage: 'SSH connection timed out'
  },
  {
    id: 'server-2',
    name: 'Render Box',
    host: 'render.local',
    status: 'online',
    gpuTotal: 4,
    busyGpuCount: 3,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: 81.2,
    averageMemoryUsagePercent: 70,
    maxTemperatureCelsius: 74,
    lastSuccessAt: '2026-06-01T00:05:00Z',
    lastErrorType: null,
    lastErrorMessage: null
  },
  {
    id: 'server-3',
    name: 'Training Rig',
    host: 'train.local',
    status: 'degraded-error',
    gpuTotal: 8,
    busyGpuCount: 6,
    freeGpuCount: 2,
    averageGpuUtilizationPercent: null,
    averageMemoryUsagePercent: null,
    maxTemperatureCelsius: null,
    lastSuccessAt: null,
    lastErrorType: 'auth_failed',
    lastErrorMessage: 'Permission denied for /Users/alice/.ssh/id_ed25519'
  }
];

const overviewFixture = overviewRows[0];

const connectionSuccess: ConnectionTestResultDto = { ok: true, status: 'online', errorType: null, message: 'Connection successful.' };

const createDeferred = <Result,>() => {
  let resolveDeferred: (value: Result) => void = () => undefined;
  const promise = new Promise<Result>((resolve) => { resolveDeferred = resolve; });

  return { promise, resolve: resolveDeferred };
};

const renderOverview = (overview: ServerOverviewDto[] = [overviewFixture], error: Error | null = null, isLoading = false) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <OverviewScreen error={error} isLoading={isLoading} overview={overview} />
    </QueryClientProvider>
  );

  return { queryClient, ...rendered };
};

describe('OverviewScreen', () => {
  beforeEach(() => {
    apiMocks.refreshServer.mockReset();
    apiMocks.seedDemoData.mockReset();
    useUiStore.setState({ activeScreen: 'overview', activeTab: 'overview', selectedServerId: null, editingServerId: null });
  });

  it('renders fixture overview DTO fields and stale error metadata', () => {
    renderOverview();

    expect(screen.getByText('Demo GPU Server')).toBeDefined();
    expect(screen.getByText('demo.local')).toBeDefined();
    expect(screen.getAllByText('stale').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ssh_timeout')).toBeDefined();
    expect(screen.getAllByText('SSH connection timed out').length).toBeGreaterThan(0);
    expect(screen.getByText('GPU total')).toBeDefined();
    expect(screen.getByText('Busy / free')).toBeDefined();
    expect(screen.getByText('Average GPU util')).toBeDefined();
    expect(screen.getByText('Showing 1 of 1 servers')).toBeDefined();
  });

  it('renders nullable metrics as unknown instead of zero', () => {
    const nullableOverview: ServerOverviewDto = {
      ...overviewFixture,
      id: 'server-null-metrics',
      averageGpuUtilizationPercent: null,
      averageMemoryUsagePercent: null,
      maxTemperatureCelsius: null,
      lastSuccessAt: null,
      lastErrorType: null,
      lastErrorMessage: null
    };

    renderOverview([nullableOverview]);

    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText('0.0%')).toBeNull();
  });

  it('filters visible servers by text across identity, status, error type, and sanitized error message', () => {
    renderOverview(overviewRows);

    const searchInput = screen.getByRole('textbox', { name: 'Search servers' });

    fireEvent.change(searchInput, { target: { value: 'render.local' } });
    expect(screen.getByText('Render Box')).toBeDefined();
    expect(screen.queryByText('Demo GPU Server')).toBeNull();
    expect(screen.getByText('Showing 1 of 3 servers')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'degraded-error' } });
    expect(screen.getByText('Training Rig')).toBeDefined();
    expect(screen.queryByText('Render Box')).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'auth_failed' } });
    expect(screen.getByText('Training Rig')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: '[path redacted]' } });
    expect(screen.getByText('Training Rig')).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
  });

  it('filters by status options derived from current overview rows', () => {
    renderOverview(overviewRows);

    const statusSelect = screen.getByRole('combobox', { name: 'Status' });
    const statusOptions = within(statusSelect).getAllByRole('option').map((option) => option.textContent);

    expect(statusOptions).toEqual(['All statuses', 'degraded-error', 'online', 'stale']);

    fireEvent.change(statusSelect, { target: { value: 'online' } });

    expect(screen.getByText('Render Box')).toBeDefined();
    expect(screen.queryByText('Demo GPU Server')).toBeNull();
    expect(screen.queryByText('Training Rig')).toBeNull();
    expect(screen.getByText('Showing 1 of 3 servers')).toBeDefined();
  });

  it('supports stale and error quick filters', () => {
    renderOverview(overviewRows);

    const quickFilterSelect = screen.getByRole('combobox', { name: 'Quick filter' });

    fireEvent.change(quickFilterSelect, { target: { value: 'stale' } });
    expect(screen.getByText('Demo GPU Server')).toBeDefined();
    expect(screen.queryByText('Render Box')).toBeNull();
    expect(screen.queryByText('Training Rig')).toBeNull();

    fireEvent.change(quickFilterSelect, { target: { value: 'error' } });
    expect(screen.getByText('Demo GPU Server')).toBeDefined();
    expect(screen.getByText('Training Rig')).toBeDefined();
    expect(screen.queryByText('Render Box')).toBeNull();
  });

  it('resets text, status, and quick filters', () => {
    renderOverview(overviewRows);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search servers' }), { target: { value: 'render' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'online' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Quick filter' }), { target: { value: 'error' } });
    expect(screen.getByText('No servers match these filters')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(screen.getByText('Demo GPU Server')).toBeDefined();
    expect(screen.getByText('Render Box')).toBeDefined();
    expect(screen.getByText('Training Rig')).toBeDefined();
    expect(screen.getByText('Showing 3 of 3 servers')).toBeDefined();
  });

  it('renders a filtered empty state distinct from no-data, loading, and error states', () => {
    renderOverview(overviewRows);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search servers' }), { target: { value: 'missing server' } });

    expect(screen.getByText('No servers match these filters')).toBeDefined();
    expect(screen.getByText('Try a broader search or reset the local visibility controls.')).toBeDefined();
    expect(screen.queryByText('No servers configured')).toBeNull();
    expect(screen.queryByText('Loading overview DTOs...')).toBeNull();
  });

  it('preserves clicking a visible server to select it and navigate to detail', () => {
    renderOverview(overviewRows);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search servers' }), { target: { value: 'render' } });
    fireEvent.click(screen.getByRole('button', { name: /Render Box/i }));

    expect(useUiStore.getState().selectedServerId).toBe('server-2');
    expect(useUiStore.getState().activeTab).toBe('detail');
  });

  it('shows pending and success feedback for a remote refresh while preserving active filters and invalidating matching stale data', async () => {
    const refresh = createDeferred<ConnectionTestResultDto>();
    apiMocks.refreshServer.mockReturnValue(refresh.promise);
    const { queryClient } = renderOverview(overviewRows);
    const refreshedKeys = [
      apiMocks.queryKeys.overview,
      apiMocks.queryKeys.servers,
      apiMocks.queryKeys.processes,
      apiMocks.queryKeys.detail('server-2'),
      apiMocks.queryKeys.gpuHistory('server-2', null, null, '1h')
    ] as const;
    const otherHistoryKey = apiMocks.queryKeys.gpuHistory('server-1', null, null, '1h');

    for (const queryKey of [...refreshedKeys, otherHistoryKey]) {
      queryClient.setQueryData(queryKey, { series: [] });
    }

    fireEvent.change(screen.getByRole('textbox', { name: 'Search servers' }), { target: { value: 'render' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'online' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(apiMocks.refreshServer).toHaveBeenCalledWith('server-2'));
    expect(screen.getByRole('status', { name: 'Refresh Render Box' }).textContent).toContain('Refresh Render Box pending');

    refresh.resolve(connectionSuccess);

    expect(await screen.findByText('Remote refresh succeeded for Render Box. Connection successful.')).toBeDefined();
    expect(screen.getByText('Render Box')).toBeDefined();
    expect(screen.queryByText('Demo GPU Server')).toBeNull();
    expect(screen.getByText('Showing 1 of 3 servers')).toBeDefined();

    await waitFor(() => expect(queryClient.getQueryState(refreshedKeys[0])?.isInvalidated).toBe(true));
    for (const queryKey of refreshedKeys.slice(1)) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(otherHistoryKey)?.isInvalidated).toBe(false);
  });

  it('shows sanitized failure feedback for a remote refresh without hiding static overview identity', async () => {
    apiMocks.refreshServer.mockRejectedValue(new Error('SSH failed for /Users/alice/.ssh/id_ed25519'));
    renderOverview(overviewRows);

    fireEvent.click(within(screen.getByRole('article', { name: /Demo GPU Server/i })).getByRole('button', { name: 'Refresh' }));

    const refreshAlert = await screen.findByRole('alert', { name: 'Refresh Demo GPU Server' });
    expect(refreshAlert.textContent).toContain('Remote refresh failed for Demo GPU Server. SSH failed for [path redacted]');
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.getByText('Fleet snapshot')).toBeDefined();
  });

  it('renders bounded diagnostics guidance for overview health and typed refresh failures', async () => {
    // Given: stale overview health plus a refresh result that carries a typed SSH diagnostic.
    const unreachableRow: ServerOverviewDto = {
      ...overviewRows[2],
      lastErrorType: 'ssh_unreachable',
      lastErrorMessage: 'Permission denied for /Users/alice/.ssh/id_ed25519'
    };
    apiMocks.refreshServer.mockResolvedValue({ ok: false, status: 'error', errorType: 'ssh_unreachable', message: 'Permission denied for /Users/alice/.ssh/id_ed25519' });
    renderOverview([overviewFixture, unreachableRow]);

    // When: the existing health cards render and the user refreshes the unreachable host.
    const timeoutArticle = screen.getByRole('article', { name: /Demo GPU Server/i });
    const unreachableArticle = screen.getByRole('article', { name: /Training Rig/i });
    fireEvent.click(within(unreachableArticle).getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(apiMocks.refreshServer).toHaveBeenCalledWith('server-3'));

    // Then: diagnostics stay inside each card, include type/message/guidance, and redact local SSH paths.
    expect(within(timeoutArticle).getAllByText('SSH connection timed out').length).toBeGreaterThan(0);
    expect(within(timeoutArticle).getByText('Type: ssh_timeout')).toBeDefined();
    expect(within(timeoutArticle).getByText(/DNS, VPN, firewall/)).toBeDefined();
    expect(within(unreachableArticle).getAllByText('SSH host unreachable').length).toBeGreaterThan(0);
    expect(within(unreachableArticle).getAllByText('Type: ssh_unreachable').length).toBeGreaterThan(0);
    expect(within(unreachableArticle).getAllByText(/Permission denied for \[path redacted\]/).length).toBeGreaterThan(0);
    expect(within(unreachableArticle).getAllByText(/Verify DNS, routing, firewall/).length).toBeGreaterThan(0);
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.getByText('Fleet snapshot')).toBeDefined();
  });

  it('shows success feedback for seeding demo data and refreshes overview collections', async () => {
    apiMocks.seedDemoData.mockResolvedValue(overviewRows);
    const { queryClient } = renderOverview([]);
    const seededKeys = [apiMocks.queryKeys.overview, apiMocks.queryKeys.servers, apiMocks.queryKeys.processes] as const;

    for (const queryKey of seededKeys) {
      queryClient.setQueryData(queryKey, []);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Seed demo data' }));

    await waitFor(() => expect(apiMocks.seedDemoData).toHaveBeenCalledWith());
    expect(await screen.findByText('Demo data seeded. 3 servers available.')).toBeDefined();
    await waitFor(() => expect(queryClient.getQueryState(seededKeys[0])?.isInvalidated).toBe(true));
    for (const queryKey of seededKeys.slice(1)) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });

  it('shows sanitized failure feedback for seeding demo data without hiding static overview identity', async () => {
    apiMocks.seedDemoData.mockRejectedValue(new Error('Failed to seed /Users/alice/.ssh/id_ed25519'));
    renderOverview([]);

    fireEvent.click(screen.getByRole('button', { name: 'Seed demo data' }));

    const seedAlert = await screen.findByRole('alert', { name: 'Seed demo data' });
    expect(seedAlert.textContent).toContain('Demo data seed failed. Failed to seed [path redacted]');
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.getByText('Fleet snapshot')).toBeDefined();
  });
});
