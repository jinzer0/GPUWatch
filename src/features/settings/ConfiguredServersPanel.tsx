import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { listServers, queryKeys, setServerEnabled } from '../../lib/api';
import { sanitizeMessage } from '../../lib/format';
import { useUiStore } from '../../lib/store';
import { invalidateSettings } from './settingsModel';

export const InlineActionsMenu = ({ label, trigger, children, onOpenChange, serverId, addTrigger }: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  onOpenChange?: (open: boolean) => void;
  serverId?: string;
  addTrigger?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const invoker = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ top: 44, left: 8 });
  const changeOpen = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
  };
  const close = () => {
    changeOpen(false);
    invoker.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !invoker.current || !menu.current) return;
    const anchor = invoker.current.getBoundingClientRect();
    const width = menu.current.offsetWidth;
    const height = menu.current.offsetHeight;
    const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    const preferredTop = anchor.bottom + height + 8 <= window.innerHeight ? anchor.bottom + 4 : anchor.top - height - 4;
    const top = Math.max(48, Math.min(preferredTop, window.innerHeight - height - 8));
    setPlacement((previous) => previous.top === top && previous.left === left ? previous : { top, left });
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    const firstItem = menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    (firstItem ?? menu.current)?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (open && (document.activeElement === menu.current || document.activeElement === document.body)) {
      (menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? menu.current)?.focus();
    }
  });

  return <div className="relative no-drag" ref={root}>
    <button aria-label={label} aria-haspopup="menu" aria-expanded={open} ref={invoker} type="button"
      data-server-menu-trigger={serverId} data-server-add-trigger={addTrigger ? '' : undefined}
      className="no-drag rounded px-2 py-1 text-[color:var(--color-muted)]"
      onClick={() => open ? close() : changeOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          changeOpen(true);
        }
      }}>{trigger}</button>
    {open ? <div role="menu" aria-label={label} ref={menu} tabIndex={-1}
      style={{ position: 'fixed', ...placement }}
      className="absolute right-0 z-50 grid min-w-44 gap-1 rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 shadow-lg"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          close();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>{children(close)}</div> : null}
  </div>;
};

export const ServerActionsMenu = ({ id, name }: { id: string; name: string }) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const openServerManager = useUiStore((state) => state.openServerManager);
  const serversQuery = useQuery({ queryKey: queryKeys.servers, queryFn: listServers, enabled: open });
  const savedServer = serversQuery.data?.find((server) => server.id === id);
  const diagnostic = serversQuery.isFetching ? `${name}: 저장된 서버를 확인 중입니다`
    : serversQuery.isError ? `${name}: 서버 조회 실패 — ${sanitizeMessage(serversQuery.error.message)}`
      : !savedServer ? `${name}: 저장된 서버를 찾을 수 없습니다` : null;
  const unavailable = pending || diagnostic !== null;

  const toggleMonitoring = async () => {
    if (!savedServer || unavailable || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await setServerEnabled(id, !savedServer.enabled);
      await invalidateSettings(queryClient);
    } catch (failure) {
      setError(sanitizeMessage(failure instanceof Error ? failure.message : '모니터링 변경 실패'));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return <div className="server-sidebar-actions">
    <InlineActionsMenu label={`${name} 서버 메뉴`} trigger="…" onOpenChange={setOpen} serverId={id}>
      {(close) => <>
        {(['edit', 'delete', 'test'] as const).map((action, index) => <button
          key={action} role="menuitem" type="button" disabled={unavailable}
          className="rounded px-2 py-1 text-left disabled:opacity-50"
          onClick={() => { close(); openServerManager(action, id); }}>
          {['서버 편집', '서버 삭제', '연결 테스트'][index]}
        </button>)}
        <button role="menuitem" type="button" disabled={unavailable}
          className="rounded px-2 py-1 text-left disabled:opacity-50"
          onClick={() => void toggleMonitoring()}>
          {savedServer ? savedServer.enabled ? '모니터링 중지' : '모니터링 시작' : '모니터링 변경'}
        </button>
        {diagnostic ? <p role="status" className="text-xs">{diagnostic}</p> : null}
      </>}
    </InlineActionsMenu>
    {pending ? <p role="status" className="text-xs">{name}: 모니터링 변경 중</p> : null}
    {error ? <p role="alert" className="text-xs">{name}: {error}</p> : null}
  </div>;
};
