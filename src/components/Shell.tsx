import { useState, type ReactNode } from 'react';
import { DropdownMenuItem } from '@astryxdesign/core/DropdownMenu';

import { Button, IconButton } from './ui';
import { InlineActionsMenu, ServerActionsMenu } from '../features/settings/ConfiguredServersPanel';
import { openSettings } from '../lib/appearance';
import { useUiStore } from '../lib/store';
import type { ServerOverviewDto } from '../lib/types';

export const Shell = ({ children, overview, selectedId, refresh }: {
  readonly children: ReactNode;
  readonly overview: ServerOverviewDto[] | null;
  readonly selectedId?: string | null;
  readonly refresh?: { readonly pending: boolean; readonly onClick: () => void };
}) => {
  const selectedServerId = useUiStore((state) => state.selectedServerId);
  const selectServer = useUiStore((state) => state.selectServer);
  const openServerManager = useUiStore((state) => state.openServerManager);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const activeServerId = selectedId === undefined ? selectedServerId : selectedId;
  const selectedServer = overview?.find((server) => server.id === activeServerId);
  const desktop = window.gpuWatcherElectron?.isElectron && window.gpuwatcher;

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
            <h1 className="titlebar-page-title">{selectedServer?.name ?? '서버 모니터'}</h1>
          </div>
          {desktop ? null : <span className="titlebar-page-context">브라우저 · 읽기 전용</span>}
          {refresh && selectedServer ? <IconButton
            label={`Refresh ${selectedServer.name}`}
            className={`toolbar-refresh no-drag${refresh.pending ? ' is-refreshing' : ''}`}
            disabled={refresh.pending}
            loading={refresh.pending}
            onClick={refresh.onClick}
            size="sm"
            variant="secondary"
            icon={<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M6.1 7a7 7 0 0 1 11.6-1.3L20 9M4 15l2.3 3.3A7 7 0 0 0 17.9 17" />
            </svg>}
          /> : null}
        </div>
      </header>
      <aside className="app-sidebar" aria-label="서버">
        <div className="server-sidebar-heading">
          <span>서버</span>
          <InlineActionsMenu label="서버 추가 또는 가져오기" trigger="+" addTrigger>
            {(close) => <>
              <DropdownMenuItem label="직접 추가" onClick={() => { close(); openServerManager('add'); }} />
              <DropdownMenuItem label="SSH config 가져오기" onClick={() => { close(); openServerManager('import'); }} />
            </>}
          </InlineActionsMenu>
        </div>
        <nav className="sidebar-nav" aria-label="서버">
          {overview === null ? <p className="sidebar-notice">서버 목록을 확인할 수 없습니다</p> : null}
          {overview?.length === 0 ? <p className="sidebar-notice">등록된 서버가 없습니다</p> : null}
          {overview?.map((server) => (
            <div className="server-sidebar-entry" key={server.id}>
            <button
              aria-current={activeServerId === server.id ? 'page' : undefined}
              aria-label={`${server.name} ${server.status}`}
              className={`no-drag server-sidebar-row ${activeServerId === server.id ? 'server-sidebar-row-selected' : ''}`}
              onClick={() => selectServer(server.id)}
              title={`${server.name} — ${server.host}`}
              type="button"
            >
              <span aria-hidden="true" className="server-sidebar-symbol">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 17.5h.01M16 7.5h2M16 17.5h2" />
                </svg>
              </span>
              <span className="server-sidebar-identity">
                <span className="server-sidebar-name">{server.name}</span>
                <span className="server-sidebar-status"><span aria-hidden="true" className="server-status-dot" data-status={server.status} />{server.status}</span>
              </span>
            </button>
            <ServerActionsMenu id={server.id} name={server.name} />
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <Button className="no-drag settings-icon" aria-label="외형 설정 열기" onClick={() => void showSettings()} size="sm" type="button" variant="ghost" icon={
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3Z" />
            </svg>}>
            외형 설정
          </Button>
          {settingsError ? <p role="alert">{settingsError}</p> : null}
        </footer>
      </aside>
      <main aria-label="Server detail content" className="app-content">
        <div className="page-container">{children}</div>
      </main>
    </div>
  );
};
