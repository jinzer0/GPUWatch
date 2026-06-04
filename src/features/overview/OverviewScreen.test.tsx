import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { OverviewScreen } from './OverviewScreen';
import { useUiStore } from '../../lib/store';
import type { ServerOverviewDto } from '../../lib/types';

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

const renderOverview = (overview: ServerOverviewDto[] = [overviewFixture], error: Error | null = null, isLoading = false) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewScreen error={error} isLoading={isLoading} overview={overview} />
    </QueryClientProvider>
  );
};

describe('OverviewScreen', () => {
  beforeEach(() => {
    useUiStore.setState({ activeScreen: 'overview', activeTab: 'overview', selectedServerId: null, editingServerId: null });
  });

  it('renders fixture overview DTO fields and stale error metadata', () => {
    renderOverview();

    expect(screen.getByText('Demo GPU Server')).toBeDefined();
    expect(screen.getByText('demo.local')).toBeDefined();
    expect(screen.getAllByText('stale').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ssh_timeout')).toBeDefined();
    expect(screen.getByText('SSH connection timed out')).toBeDefined();
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
});
