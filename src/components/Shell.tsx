import { useState, type ReactNode } from 'react';

import { InlineActionsMenu, ServerActionsMenu } from '../features/settings/ConfiguredServersPanel';
import { openSettings } from '../lib/appearance';
import { useUiStore } from '../lib/store';
import type { ServerOverviewDto } from '../lib/types';

export const Shell = ({ children, overview }: { children: ReactNode; overview: ServerOverviewDto[] | null }) => {
  const selectedServerId = useUiStore((state) => state.selectedServerId);
  const selectServer = useUiStore((state) => state.selectServer);
  const openServerManager = useUiStore((state) => state.openServerManager);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const selectedServer = overview?.find((server) => server.id === selectedServerId);
  const runtime = window.gpuWatcherElectron?.isElectron && window.gpuwatcher ? '데스크톱' : '브라우저 · 읽기 전용';

  const showSettings = async () => {
    setSettingsError(null);
    try {
      await openSettings();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not open settings.');
    }
  };

  return (
    <div className="app-shell">
      <header className="window-titlebar">
        <div className="titlebar-sidebar">
          <div className="traffic-light-space" aria-hidden="true" />
          <div className="app-name">GPUWatcher</div>
        </div>
        <div className="titlebar-main">
          <div className="titlebar-heading">
            <div className="titlebar-page-title">{selectedServer?.name ?? 'GPUWatcher'}</div>
          </div>
          <span className="titlebar-page-context">{runtime}</span>
        </div>
      </header>
      <aside className="app-sidebar" aria-label="서버">
        <div className="server-sidebar-heading">
          <span>서버</span>
          <InlineActionsMenu label="서버 추가 또는 가져오기" trigger="+" addTrigger>
            {(close) => <>
              <button role="menuitem" type="button" className="rounded px-2 py-1 text-left" onClick={() => { close(); openServerManager('add'); }}>직접 추가</button>
              <button role="menuitem" type="button" className="rounded px-2 py-1 text-left" onClick={() => { close(); openServerManager('import'); }}>SSH config 가져오기</button>
            </>}
          </InlineActionsMenu>
        </div>
        <nav className="sidebar-nav" aria-label="서버">
          {overview === null ? <p className="sidebar-notice">서버 목록을 확인할 수 없습니다</p> : null}
          {overview?.length === 0 ? <p className="sidebar-notice">등록된 서버가 없습니다</p> : null}
          {overview?.map((server) => (
            <div className="server-sidebar-entry" key={server.id}>
            <button
              aria-current={selectedServerId === server.id ? 'page' : undefined}
              aria-label={`${server.name} ${server.status}`}
              className={`no-drag server-sidebar-row min-w-0 flex-1 ${selectedServerId === server.id ? 'server-sidebar-row-selected' : ''}`}
              onClick={() => selectServer(server.id)}
              title={`${server.name} — ${server.host}`}
              type="button"
            >
              <span className="server-sidebar-name">{server.name}</span>
              <span className="server-sidebar-status">{server.status}</span>
            </button>
            <ServerActionsMenu id={server.id} name={server.name} />
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <button className="no-drag settings-icon" aria-label="외형 설정 열기" onClick={() => void showSettings()} type="button">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3Z" />
            </svg>
          </button>
          {settingsError ? <p role="alert">{settingsError}</p> : null}
        </footer>
      </aside>
      <main aria-label="Server detail content" className="app-content">
        <div className="page-container">{children}</div>
      </main>
    </div>
  );
};
