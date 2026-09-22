import type { ReactNode } from 'react';

import { useUiStore, type DensityMode } from '../lib/store';
import type { ServerOverviewDto, TabId } from '../lib/types';

const tabLabels: Record<TabId, string> = {
  detail: 'GPU Detail',
  history: 'History',
  overview: 'Fleet',
  processes: 'Processes',
  settings: 'Settings'
};

const tabs: ReadonlyArray<{ readonly id: TabId; readonly label: string }> = [
  { id: 'overview', label: tabLabels.overview },
  { id: 'detail', label: tabLabels.detail },
  { id: 'processes', label: tabLabels.processes },
  { id: 'history', label: tabLabels.history },
  { id: 'settings', label: tabLabels.settings }
];

const densityOptions: ReadonlyArray<{ readonly id: DensityMode; readonly label: string }> = [
  { id: 'full', label: 'Full' },
  { id: 'compact', label: 'Compact' }
];

const getRuntimeStatusLabel = () => {
  if (typeof window !== 'undefined' && window.gpuWatcherElectron?.isElectron && window.gpuwatcher) {
    return 'Desktop backend';
  }

  return 'Browser fallback';
};

export const Shell = ({ children, overview }: { children: ReactNode; overview: ServerOverviewDto[] | null }) => {
  const activeTab = useUiStore((state) => state.activeTab);
  const densityMode = useUiStore((state) => state.densityMode);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const setDensityMode = useUiStore((state) => state.setDensityMode);
  const onlineCount = overview?.filter((server) => server.status.toLowerCase() === 'online').length ?? null;
  const serverCountLabel = overview === null ? 'unknown' : `${overview.length} ${overview.length === 1 ? 'server' : 'servers'}`;
  const onlineCountLabel = onlineCount === null ? 'unknown' : `${onlineCount} online`;
  const runtimeStatusLabel = getRuntimeStatusLabel();

  return (
    <div className="app-shell" data-density={densityMode}>
      <header className="window-titlebar">
        <div className="titlebar-sidebar">
          <div className="traffic-light-space" aria-hidden="true" />
          <div className="app-name">GPUWatcher</div>
        </div>
        <div className="titlebar-main">
          <div className="titlebar-heading">
            <div className="titlebar-page-title">{tabLabels[activeTab]}</div>
            <div className="titlebar-page-context">GPU Activity Monitor</div>
          </div>
          <div aria-label="Fleet status" className="titlebar-status">
            <span
              aria-label={`Fleet: ${serverCountLabel}`}
              className="titlebar-status-item"
              title={`Fleet: ${serverCountLabel}`}
            >
              <span className="titlebar-status-label">Fleet</span>
              <span className="titlebar-status-value">{serverCountLabel}</span>
            </span>
            <span
              aria-label={`Online servers: ${onlineCountLabel}`}
              className="titlebar-status-item"
              title={`Online servers: ${onlineCountLabel}`}
            >
              <span className="titlebar-status-label">Online</span>
              <span className="titlebar-status-value">{onlineCountLabel}</span>
            </span>
            <span
              aria-label={`Runtime: ${runtimeStatusLabel}`}
              className="titlebar-status-item"
              title={`Runtime: ${runtimeStatusLabel}`}
            >
              <span className="titlebar-status-label">Runtime</span>
              <span className="titlebar-status-value">{runtimeStatusLabel}</span>
            </span>
          </div>
        </div>
      </header>

      <aside className="app-sidebar" aria-label="Application navigation">
        <nav className="sidebar-nav" aria-label="Primary">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                aria-current={isActive ? 'page' : undefined}
                className={`no-drag sidebar-nav-item w-full border-l-2 text-left text-sm transition ${
                  isActive
                    ? 'sidebar-nav-item-active border-[color:var(--color-brand)] font-extrabold text-[color:var(--color-text)]'
                    : 'border-transparent font-semibold text-[color:var(--color-muted)] hover:bg-white/5 hover:text-[color:var(--color-text)]'
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <footer className="sidebar-footer">
          <section aria-labelledby="density-control-heading" className="density-control">
            <div className="eyebrow" id="density-control-heading">
              Display density
            </div>
            <div className="density-control-options mt-3 grid grid-cols-2 gap-2" role="group" aria-labelledby="density-control-heading">
              {densityOptions.map((option) => {
                const isActive = densityMode === option.id;

                return (
                  <button
                    aria-label={`Use ${option.id} density`}
                    aria-pressed={isActive}
                    className={`no-drag density-control-option rounded-[var(--radius-sm)] border text-sm font-extrabold transition ${
                      isActive
                        ? 'density-control-option-active border-[color:var(--color-brand)] bg-[var(--color-brand-soft)] text-[color:var(--color-brand)]'
                        : 'border-[color:var(--color-line)] text-[color:var(--color-muted)] hover:border-[color:var(--color-line-strong)] hover:bg-white/5 hover:text-[color:var(--color-text)]'
                    }`}
                    key={option.id}
                    onClick={() => setDensityMode(option.id)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        </footer>
      </aside>

      <main aria-label={`${tabLabels[activeTab]} content`} className="app-content">
        <div className="page-container">{children}</div>
      </main>
    </div>
  );
};
