import type { ReactNode } from 'react';

import { useUiStore } from '../lib/store';
import type { ServerOverviewDto, TabId } from '../lib/types';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'detail', label: 'Server Detail' },
  { id: 'processes', label: 'Process Table' },
  { id: 'settings', label: 'Settings' }
];

export const Shell = ({ children, overview }: { children: ReactNode; overview: ServerOverviewDto[] | null }) => {
  const activeTab = useUiStore((state) => state.activeTab);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const onlineCount = overview?.filter((server) => server.status.toLowerCase() === 'online').length ?? null;

  return (
    <div className="app-shell">
      <div className="mx-auto grid max-w-7xl grid-cols-[17rem_1fr] gap-6">
        <aside className="panel sticky top-6 h-[calc(100vh-3rem)] overflow-hidden p-5">
          <div className="eyebrow">GPUWatcher v0.1</div>
          <h1 className="mt-4 font-[var(--font-display)] text-3xl font-black leading-none tracking-[-0.08em]">
            Remote GPU console
          </h1>
          <p className="mt-4 text-sm leading-6 text-[color:var(--color-muted)]">
            Live backend DTOs from trusted Tauri commands, shaped into a compact mission-control MVP.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="surface p-3">
              <div className="eyebrow">Servers</div>
              <div className="metric-value">{overview?.length ?? 'unknown'}</div>
            </div>
            <div className="surface p-3">
              <div className="eyebrow">Online</div>
              <div className="metric-value text-[color:var(--color-online)]">{onlineCount ?? 'unknown'}</div>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {tabs.map((tab) => (
              <button
                className={`w-full rounded-[var(--radius-md)] px-4 py-3 text-left text-sm transition ${
                  activeTab === tab.id
                    ? 'bg-[var(--color-accent-soft)] text-[color:var(--color-accent)]'
                    : 'text-[color:var(--color-muted)] hover:bg-white/5 hover:text-[color:var(--color-text)]'
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
};
