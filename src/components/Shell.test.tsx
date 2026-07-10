import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../lib/store';
import type { ServerOverviewDto, TabId } from '../lib/types';
import { Shell } from './Shell';

const tabCases: ReadonlyArray<{ readonly id: TabId; readonly label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'detail', label: 'Server Detail' },
  { id: 'history', label: 'Live Monitor' },
  { id: 'processes', label: 'Process Table' },
  { id: 'settings', label: 'Settings' }
];

const buildOverviewServer = ({ id, status }: { readonly id: string; readonly status: string }): ServerOverviewDto => ({
  id,
  name: `Server ${id}`,
  host: `${id}.example.test`,
  status,
  gpuTotal: 2,
  busyGpuCount: 1,
  freeGpuCount: 1,
  averageGpuUtilizationPercent: 62,
  averageMemoryUsagePercent: 25,
  maxTemperatureCelsius: 61,
  lastSuccessAt: null,
  lastErrorType: null,
  lastErrorMessage: null,
});

const overviewFixture: ServerOverviewDto[] = [buildOverviewServer({ id: 'server-1', status: 'online' })];

const mixedStatusOverview: ServerOverviewDto[] = [
  buildOverviewServer({ id: 'server-1', status: 'ONLINE' }),
  buildOverviewServer({ id: 'server-2', status: 'offline' }),
  buildOverviewServer({ id: 'server-3', status: 'online' })
];

const renderShell = (overview: ServerOverviewDto[] | null = overviewFixture) =>
  render(
    <Shell overview={overview}>
      <section aria-label="Screen content">Metrics stay visible</section>
    </Shell>
  );

const getRequiredElement = (container: HTMLElement, selector: string): HTMLElement => {
  const element = container.querySelector(selector);

  if (element instanceof HTMLElement) {
    return element;
  }

  throw new Error(`Expected ${selector} to render`);
};

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

  it('renders every primary navigation item', () => {
    renderShell();

    const navigation = screen.getByRole('navigation');
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent)).toEqual(tabCases.map((tab) => tab.label));
  });

  it('clicking each navigation item updates the active tab and screen through the real store', () => {
    renderShell();

    const navigation = screen.getByRole('navigation');

    for (const tab of tabCases) {
      const tabButton = within(navigation).getByRole('button', { name: tab.label });

      fireEvent.click(tabButton);

      expect(useUiStore.getState().activeTab).toBe(tab.id);
      expect(useUiStore.getState().activeScreen).toBe(tab.id);
      expect(tabButton.getAttribute('aria-current')).toBe('page');
    }
  });

  it('renders Display mode controls and applies the root density attribute', () => {
    const view = renderShell();

    const shell = getRequiredElement(view.container, '.app-shell');
    const fullButton = screen.getByRole('button', { name: 'Use full display mode' });
    const compactButton = screen.getByRole('button', { name: 'Use compact display mode' });

    expect(screen.getByText('Display mode')).toBeDefined();
    expect(shell.matches('.app-shell[data-density="full"]')).toBe(true);
    expect(fullButton.getAttribute('aria-pressed')).toBe('true');
    expect(compactButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(compactButton);

    expect(useUiStore.getState().densityMode).toBe('compact');
    expect(shell.matches('.app-shell[data-density="compact"]')).toBe(true);
    expect(compactButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Metrics stay visible')).toBeDefined();
    expect(window.localStorage.getItem('densityMode')).toBeNull();

    fireEvent.click(fullButton);

    expect(useUiStore.getState().densityMode).toBe('full');
    expect(shell.matches('.app-shell[data-density="full"]')).toBe(true);
  });

  it('renders titlebar identity and updates the active page label', () => {
    const view = renderShell();
    const titlebar = getRequiredElement(view.container, '.window-titlebar');

    expect(within(titlebar).getByText('GPUWatcher')).toBeDefined();
    expect(within(titlebar).getByText('Overview')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Live Monitor' }));

    expect(within(titlebar).getByText('Live Monitor')).toBeDefined();
  });

  it('renders unknown server counts when overview data has not loaded', () => {
    renderShell(null);

    expect(screen.getAllByText('unknown')).toHaveLength(2);
  });

  it('renders zero server and online count labels for an empty overview', () => {
    renderShell([]);

    expect(screen.getByText('0 servers')).toBeDefined();
    expect(screen.getByText('0 online')).toBeDefined();
  });

  it('counts online servers case-insensitively in the shell status copy', () => {
    renderShell(mixedStatusOverview);

    expect(screen.getByText('3 servers')).toBeDefined();
    expect(screen.getByText('2 online')).toBeDefined();
  });

  it('renders children inside the semantic page container', () => {
    const view = renderShell();
    const pageContainer = getRequiredElement(view.container, '.app-content .page-container');

    expect(within(pageContainer).getByText('Metrics stay visible')).toBeDefined();
  });
});
