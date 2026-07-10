import type { ReactNode } from 'react';

import { useUiStore, type DensityMode } from '../lib/store';
import type { ServerOverviewDto, TabId } from '../lib/types';

const tabLabels: Record<TabId, string> = {
  detail: 'Server Detail',
  history: 'Live Monitor',
  overview: 'Overview',
  processes: 'Process Table',
  settings: 'Settings'
};

const tabs: ReadonlyArray<{ readonly id: TabId; readonly label: string }> = [
  { id: 'overview', label: tabLabels.overview },
  { id: 'detail', label: tabLabels.detail },
  { id: 'history', label: tabLabels.history },
  { id: 'processes', label: tabLabels.processes },
  { id: 'settings', label: tabLabels.settings }
];

const densityOptions: ReadonlyArray<{ readonly id: DensityMode; readonly label: string }> = [
  { id: 'full', label: 'Full' },
  { id: 'compact', label: 'Compact' }
];

export const Shell = ({ children, overview }: { children: ReactNode; overview: ServerOverviewDto[] | null }) => {
  const activeTab = useUiStore((state) => state.activeTab);
  const densityMode = useUiStore((state) => state.densityMode);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const setDensityMode = useUiStore((state) => state.setDensityMode);
  const onlineCount = overview?.filter((server) => server.status.toLowerCase() === 'online').length ?? null;
  const serverCountLabel = overview === null ? 'unknown' : `${overview.length} ${overview.length === 1 ? 'server' : 'servers'}`;
  const onlineCountLabel = onlineCount === null ? 'unknown' : `${onlineCount} online`;

  return (
    <div className="app-shell" data-density={densityMode}>
      <header className="window-titlebar">
        <div className="titlebar-sidebar">
          <div className="traffic-light-space" aria-hidden="true" />
          <div className="app-name">GPUWatcher</div>
        </div>
        <div className="titlebar-main">
          <div className="titlebar-page-title">{tabLabels[activeTab]}</div>
          <div aria-label="Fleet status" className="titlebar-status">
            <span>{serverCountLabel}</span>
            <span>{onlineCountLabel}</span>
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
                className={`no-drag sidebar-nav-item w-full border-l-2 px-4 py-3 text-left text-sm transition ${
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
          <section aria-labelledby="display-mode-heading" className="density-control">
            <div className="eyebrow" id="display-mode-heading">
              Display mode
            </div>
            <div className="density-control-options mt-3 grid grid-cols-2 gap-2" role="group" aria-labelledby="display-mode-heading">
              {densityOptions.map((option) => {
                const isActive = densityMode === option.id;

                return (
                  <button
                    aria-label={`Use ${option.id} display mode`}
                    aria-pressed={isActive}
                    className={`no-drag density-control-option rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-extrabold transition ${
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

      <main className="app-content">
        <div className="page-container">{children}</div>
      </main>
    </div>
  );
};
