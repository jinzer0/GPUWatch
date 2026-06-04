import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../lib/store';
import type { ServerOverviewDto } from '../lib/types';
import { Shell } from './Shell';

const overviewFixture: ServerOverviewDto[] = [
  {
    id: 'server-1',
    name: 'Lab GPU',
    host: 'gpu.example.test',
    status: 'online',
    gpuTotal: 2,
    busyGpuCount: 1,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: 62,
    averageMemoryUsagePercent: 25,
    maxTemperatureCelsius: 61,
    lastSuccessAt: null,
    lastErrorType: null,
    lastErrorMessage: null,
  }
];

describe('Shell density mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  it('defaults to full density and exposes a session-only toggle path', () => {
    expect(useUiStore.getState().densityMode).toBe('full');

    useUiStore.getState().toggleDensityMode();

    expect(useUiStore.getState().densityMode).toBe('compact');
    expect(window.localStorage.getItem('densityMode')).toBeNull();

    useUiStore.getState().toggleDensityMode();

    expect(useUiStore.getState().densityMode).toBe('full');
  });

  it('renders Display mode controls and applies the root density attribute', () => {
    const view = render(
      <Shell overview={overviewFixture}>
        <section aria-label="Screen content">Metrics stay visible</section>
      </Shell>
    );

    const shell = view.container.querySelector('.app-shell');
    const fullButton = screen.getByRole('button', { name: 'Use full display mode' });
    const compactButton = screen.getByRole('button', { name: 'Use compact display mode' });

    expect(screen.getByText('Display mode')).toBeDefined();
    expect(shell?.getAttribute('data-density')).toBe('full');
    expect(fullButton.getAttribute('aria-pressed')).toBe('true');
    expect(compactButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(compactButton);

    expect(useUiStore.getState().densityMode).toBe('compact');
    expect(shell?.getAttribute('data-density')).toBe('compact');
    expect(compactButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Metrics stay visible')).toBeDefined();
    expect(window.localStorage.getItem('densityMode')).toBeNull();

    fireEvent.click(fullButton);

    expect(useUiStore.getState().densityMode).toBe('full');
    expect(shell?.getAttribute('data-density')).toBe('full');
  });
});
