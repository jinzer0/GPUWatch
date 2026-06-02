import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OverviewScreen } from './OverviewScreen';
import type { ServerOverviewDto } from '../../lib/types';

const overviewFixture: ServerOverviewDto = {
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
};

const renderOverview = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewScreen error={null} isLoading={false} overview={[overviewFixture]} />
    </QueryClientProvider>
  );
};

describe('OverviewScreen', () => {
  it('renders fixture overview DTO fields and stale error metadata', () => {
    renderOverview();

    expect(screen.getByText('Demo GPU Server')).toBeDefined();
    expect(screen.getByText('demo.local')).toBeDefined();
    expect(screen.getByText('stale')).toBeDefined();
    expect(screen.getByText('ssh_timeout')).toBeDefined();
    expect(screen.getByText('SSH connection timed out')).toBeDefined();
    expect(screen.getByText('GPU total')).toBeDefined();
    expect(screen.getByText('Busy / free')).toBeDefined();
    expect(screen.getByText('Average GPU util')).toBeDefined();
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
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <OverviewScreen error={null} isLoading={false} overview={[nullableOverview]} />
      </QueryClientProvider>
    );

    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText('0.0%')).toBeNull();
  });

});
