import { useId, useRef, useState, type ReactNode } from 'react';
import { DropdownMenu, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu';
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
  const invoker = useRef<HTMLButtonElement | null>(null);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
  };
  const close = () => {
    changeOpen(false);
    invoker.current?.focus();
  };

  return <DropdownMenu
    alignment="end"
    className="server-action-menu"
    isMenuOpen={open}
    menuWidth={208}
    onOpenChange={changeOpen}
    renderTrigger={(props) => <button
      {...props}
      aria-label={label}
      className="server-menu-trigger no-drag"
      data-server-menu-trigger={serverId}
      data-server-add-trigger={addTrigger ? '' : undefined}
      ref={(element) => { props.ref(element); invoker.current = element; }}
      type="button"
    >{trigger}</button>}
  >{children(close)}</DropdownMenu>;
};

export const ServerActionsMenu = ({ id, name }: { id: string; name: string }) => {
  const diagnosticId = useId();
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
        {(['edit', 'delete', 'test'] as const).map((action, index) => <DropdownMenuItem
          aria-label={['서버 편집', '서버 삭제', '연결 테스트'][index]}
          key={action}
          aria-describedby={diagnostic ? diagnosticId : undefined}
          isDisabled={unavailable}
          label={['서버 편집', '서버 삭제', '연결 테스트'][index]}
          onClick={() => { if (!unavailable) { close(); openServerManager(action, id); } }}
          variant={action === 'delete' ? 'destructive' : 'default'}
        />)}
        <DropdownMenuItem
          aria-label={savedServer ? savedServer.enabled ? '모니터링 중지' : '모니터링 시작' : '모니터링 변경'}
          aria-describedby={diagnostic ? diagnosticId : undefined}
          hasCloseOnSelect={false}
          isDisabled={unavailable}
          label={savedServer ? savedServer.enabled ? '모니터링 중지' : '모니터링 시작' : '모니터링 변경'}
          onClick={() => void toggleMonitoring()}
        />
      </>}
    </InlineActionsMenu>
    {diagnostic && open ? <p role="status" id={diagnosticId} className="server-menu-diagnostic">{diagnostic}</p> : null}
    {pending ? <p role="status" className="text-xs">{name}: 모니터링 변경 중</p> : null}
    {error ? <p role="alert" className="text-xs">{name}: {error}</p> : null}
  </div>;
};
