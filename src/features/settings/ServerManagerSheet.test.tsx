import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { ServerManagementAction } from '../../lib/store';
import type { ConnectionTestResultDto, Server } from '../../lib/types';
import { okBridgeResponse, setGpuWatcherBridge } from '../../test-utils/bridge';
import { renderWithQueryClient } from '../../test-utils/query';
import { overviewRow, serverFromInput, serverInput, settingsSshConfigImportResult } from '../../test-utils/server-fixtures';
import { ServerManagerSheet } from './ServerManagerSheet';
import { SettingsScreen } from './SettingsScreen';

const servers = [
  serverFromInput({ ...serverInput, id: 'server-a', name: 'Alpha GPU', host: 'alpha.local' }),
  serverFromInput({ ...serverInput, id: 'server-b', name: 'Beta GPU', host: 'beta.local' })
];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
};

const ModalHost = ({ action = 'add', target = null }: { action?: ServerManagementAction; target?: string | null }) => {
  const open = useUiStore((state) => state.managementOpen);
  return (
    <>
      <button data-server-add-trigger onClick={() => useUiStore.getState().openServerManager('add')} type="button">Add fallback</button>
      <button onClick={() => useUiStore.getState().openServerManager(action, target)} type="button">Open manager</button>
      <main aria-label="Current GPU detail">Alpha detail remains mounted</main>
      {open ? <ServerManagerSheet /> : null}
    </>
  );
};

const openModal = (action: ServerManagementAction = 'add', target: string | null = null) => {
  const rendered = renderWithQueryClient(<ModalHost action={action} target={target} />);
  const invoker = screen.getByRole('button', { name: 'Open manager' });
  invoker.focus();
  fireEvent.click(invoker);
  return { ...rendered, invoker };
};

const fillNewServer = () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New GPU' } });
  fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'new.local' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
};

describe('ServerManagerSheet', () => {
  beforeEach(() => {
    useUiStore.getState().closeServerManager();
    useUiStore.setState({ selectedServerId: 'server-a' });
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(settingsSshConfigImportResult)),
      saveServer: vi.fn().mockImplementation(({ input }) => Promise.resolve(okBridgeResponse(serverFromInput(input)))),
      deleteServer: vi.fn().mockResolvedValue(okBridgeResponse(undefined)),
      testConnection: vi.fn().mockResolvedValue(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'SSH ready' }))
    });
  });

  it.each([
    ['add', null, '서버 추가'],
    ['edit', 'server-b', '서버 편집'],
    ['delete', 'server-b', '서버 삭제'],
    ['test', 'server-b', 'SSH 연결 테스트'],
    ['import', null, 'SSH config 가져오기']
  ] as const)('names the %s dialog and only renders its action workspace', async (action, target, title) => {
    openModal(action, target);
    const dialog = await screen.findByRole('dialog', { name: title });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('main', { name: 'Current GPU detail' }).textContent).toBe('Alpha detail remains mounted');
    expect(screen.queryByRole('region', { name: 'Registry summary' })).toBeNull();
    expect(screen.queryByLabelText('Configured servers')).toBeNull();
    if (action === 'add' || action === 'edit') {
      await screen.findByLabelText('Name');
      expect(within(dialog).getByRole('button', { name: 'Save server' })).toBeDefined();
      expect(screen.queryByRole('region', { name: 'SSH config import' })).toBeNull();
    } else {
      expect(screen.queryByLabelText('Name')).toBeNull();
      if (action === 'import') await screen.findByRole('button', { name: 'Import from SSH config' });
      if (action === 'delete') await screen.findByRole('button', { name: 'Confirm delete Beta GPU' });
      if (action === 'test') await screen.findByText('SSH ready');
    }
  });

  it('keeps SettingsScreen closed until management is explicitly requested', async () => {
    renderWithQueryClient(<SettingsScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useUiStore.getState().openServerManager('add'));
    await screen.findByRole('dialog', { name: '서버 추가' });
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('wraps Tab boundaries, preserves native interior keyboard controls, and restores the invoker on Escape', async () => {
    const { invoker } = openModal();
    await screen.findByLabelText('Name');
    const close = screen.getByRole('button', { name: 'Close drawer' });
    const save = screen.getByRole('button', { name: 'Save server' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    const name = screen.getByLabelText('Name');
    name.focus();
    expect(fireEvent.keyDown(name, { key: 'Tab', cancelable: true })).toBe(true);
    fireEvent.keyDown(name, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(invoker);
  });

  it('does not bounce input focus or detail selection as controlled values change', async () => {
    openModal('edit', 'server-b');
    const name = await screen.findByDisplayValue('Beta GPU');
    name.focus();
    for (const value of ['Beta G', 'Beta GP', 'Beta GPU edited']) {
      fireEvent.change(name, { target: { value } });
      expect(document.activeElement).toBe(name);
      expect(useUiStore.getState().selectedServerId).toBe('server-a');
    }
    expect(screen.getByRole('main', { name: 'Current GPU detail' })).toBeDefined();
  });

  it.each(['close', 'escape'] as const)('reviews dirty changes before %s and defaults to continuing editing', async (method) => {
    openModal();
    const name = await screen.findByLabelText('Name');
    name.focus();
    fireEvent.change(name, { target: { value: 'Unsaved GPU' } });
    if (method === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    else fireEvent.keyDown(name, { key: 'Escape' });
    const review = await screen.findByRole('alertdialog', { name: /미저장 변경/ });
    expect(document.activeElement).toBe(within(review).getByRole('button', { name: '계속 편집' }));
    fireEvent.click(within(review).getByRole('button', { name: '계속 편집' }));
    expect(await screen.findByLabelText('Name')).toHaveProperty('value', 'Unsaved GPU');
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '변경 버리기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('recognizes semantic dirty reversion instead of a sticky touched flag', async () => {
    openModal('edit', 'server-b');
    const name = await screen.findByDisplayValue('Beta GPU');
    fireEvent.change(name, { target: { value: 'Other GPU' } });
    fireEvent.change(name, { target: { value: 'Beta GPU' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('blocks Close and Escape during save, exposes the reason, and preserves failed input', async () => {
    const request = deferred<ReturnType<typeof okBridgeResponse<Server>>>();
    const saveServer = vi.fn().mockReturnValue(request.promise);
    setGpuWatcherBridge({ listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)), saveServer });
    openModal();
    await screen.findByLabelText('Name');
    fillNewServer();
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));
    await waitFor(() => expect(saveServer).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '서버 추가' })).toBeDefined();
    expect(screen.getByText(/처리 중/)).toBeDefined();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => request.reject(new Error('Local save failed')));
    expect(await screen.findByText('Local save failed')).toBeDefined();
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'New GPU');
    expect(useUiStore.getState().selectedServerId).toBe('server-a');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await screen.findByRole('alertdialog', { name: /미저장 변경/ });
  });

  it('reports local save separately from SSH success and does not test implicitly', async () => {
    const testConnection = vi.fn();
    let savedServers = servers;
    setGpuWatcherBridge({
      listServers: vi.fn().mockImplementation(() => Promise.resolve(okBridgeResponse(savedServers))),
      saveServer: vi.fn().mockImplementation(({ input }) => {
        const saved = serverFromInput(input);
        savedServers = [...savedServers, saved];
        return Promise.resolve(okBridgeResponse(saved));
      }),
      testConnection
    });
    openModal();
    await screen.findByLabelText('Name');
    fillNewServer();
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));
    expect(await screen.findByText(/Local configuration saved/)).toBeDefined();
    expect(screen.getByText(/SSH connection has not been tested by saving/)).toBeDefined();
    expect(testConnection).not.toHaveBeenCalled();
    expect(screen.queryByText('SSH ready')).toBeNull();
  });

  it('waits for the saved delete target, defaults to Cancel, and deletes B without clearing selected A', async () => {
    const list = deferred<ReturnType<typeof okBridgeResponse<readonly Server[]>>>();
    const deletion = deferred<ReturnType<typeof okBridgeResponse<undefined>>>();
    const deleteServer = vi.fn().mockReturnValue(deletion.promise);
    setGpuWatcherBridge({ listServers: vi.fn().mockReturnValue(list.promise), deleteServer });
    openModal('delete', 'server-b');
    expect(screen.queryByRole('button', { name: /Confirm delete/ })).toBeNull();
    expect(deleteServer).not.toHaveBeenCalled();
    await act(async () => list.resolve(okBridgeResponse(servers)));
    const confirm = await screen.findByRole('button', { name: 'Confirm delete Beta GPU' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(deleteServer).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(deleteServer).toHaveBeenCalledWith({ id: 'server-b' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText(/처리 중/)).toBeDefined();
    await act(async () => deletion.resolve(okBridgeResponse(undefined)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useUiStore.getState().selectedServerId).toBe('server-a');
  });

  it('keeps a null SSH success message unknown without inventing a result', async () => {
    const testConnection = vi.fn().mockResolvedValue(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: null }));
    setGpuWatcherBridge({ listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)), testConnection });
    openModal('test', 'server-b');
    expect(await screen.findByText('unknown')).toBeDefined();
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(testConnection).toHaveBeenCalledWith({ id: 'server-b' });
  });

  it('does not delete when the safe default cancel is activated', async () => {
    const deleteServer = vi.fn();
    setGpuWatcherBridge({ listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)), deleteServer });
    const { invoker } = openModal('delete', 'server-b');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleteServer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(invoker);
  });

  it('removes only the confirmed target from server and overview caches before closing', async () => {
    const deletion = deferred<ReturnType<typeof okBridgeResponse<undefined>>>();
    const refreshedList = deferred<ReturnType<typeof okBridgeResponse<readonly Server[]>>>();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValueOnce(okBridgeResponse(servers)).mockReturnValue(refreshedList.promise),
      deleteServer: vi.fn().mockReturnValue(deletion.promise)
    });
    const { queryClient } = openModal('delete', 'server-b');
    queryClient.setQueryData(queryKeys.overview, [
      { ...overviewRow, id: 'server-a' },
      { ...overviewRow, id: 'server-b' }
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm delete Beta GPU' }));
    await act(async () => deletion.resolve(okBridgeResponse(undefined)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(queryClient.getQueryData<readonly Server[]>(queryKeys.servers)?.map((server) => server.id)).toEqual(['server-a']);
    expect(queryClient.getQueryData<readonly { id: string }[]>(queryKeys.overview)?.map((server) => server.id)).toEqual(['server-a']);
    expect(useUiStore.getState().selectedServerId).toBe('server-a');
    await act(async () => refreshedList.resolve(okBridgeResponse([servers[0]!])));
  });

  it('preserves a failed deletion target, detail selection, and the saved server list', async () => {
    const deletion = deferred<ReturnType<typeof okBridgeResponse<undefined>>>();
    const listServers = vi.fn().mockResolvedValue(okBridgeResponse(servers));
    const deleteServer = vi.fn().mockReturnValue(deletion.promise);
    setGpuWatcherBridge({ listServers, deleteServer });
    openModal('delete', 'server-b');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm delete Beta GPU' }));
    await waitFor(() => expect(deleteServer).toHaveBeenCalledWith({ id: 'server-b' }));
    await act(async () => deletion.reject(new Error('Beta delete failed')));
    expect(await screen.findByText('Beta delete failed')).toBeDefined();
    expect(screen.getAllByText('Beta delete failed')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Confirm delete Beta GPU' })).toHaveProperty('disabled', false);
    expect(useUiStore.getState().selectedServerId).toBe('server-a');
    expect(useUiStore.getState().editingServerId).toBe('server-b');
    expect(listServers).toHaveBeenCalledTimes(1);
  });

  it('starts connection testing only after the requested saved target has loaded', async () => {
    const list = deferred<ReturnType<typeof okBridgeResponse<readonly Server[]>>>();
    const connection = deferred<ReturnType<typeof okBridgeResponse<ConnectionTestResultDto>>>();
    const testConnection = vi.fn().mockReturnValue(connection.promise);
    setGpuWatcherBridge({ listServers: vi.fn().mockReturnValue(list.promise), testConnection });
    openModal('test', 'server-b');
    expect(testConnection).not.toHaveBeenCalled();
    await act(async () => list.resolve(okBridgeResponse(servers)));
    await waitFor(() => expect(testConnection).toHaveBeenCalledWith({ id: 'server-b' }));
    expect(screen.getByText('Connection test pending')).toBeDefined();
    await act(async () => connection.resolve(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'Beta SSH ready' })));
    expect(await screen.findByText('Beta SSH ready')).toBeDefined();
    expect(useUiStore.getState().selectedServerId).toBe('server-a');
  });

  it.each(['success', 'failure'] as const)('settles a cached-target automatic test after StrictMode replay (%s)', async (outcome) => {
    const connection = deferred<ReturnType<typeof okBridgeResponse<ConnectionTestResultDto>>>();
    const testConnection = vi.fn().mockReturnValue(connection.promise);
    setGpuWatcherBridge({ listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)), testConnection });
    const { queryClient } = renderWithQueryClient(<StrictMode><ModalHost action="test" target="server-b" /></StrictMode>);
    act(() => queryClient.setQueryData(queryKeys.servers, servers));
    fireEvent.click(screen.getByRole('button', { name: 'Open manager' }));
    await waitFor(() => expect(testConnection).toHaveBeenCalledTimes(1));
    expect(testConnection).toHaveBeenCalledWith({ id: 'server-b' });
    expect(screen.getByText('Connection test pending')).toBeDefined();
    if (outcome === 'success') {
      await act(async () => connection.resolve(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'StrictMode SSH ready' })));
      expect(await screen.findByText('StrictMode SSH ready')).toBeDefined();
    } else {
      await act(async () => connection.reject(new Error('StrictMode transport denied')));
      expect(await screen.findByText('StrictMode transport denied')).toBeDefined();
    }
    expect(screen.queryByText('Connection test pending')).toBeNull();
    expect(screen.getByRole('button', { name: 'Test SSH connection' })).toHaveProperty('disabled', false);
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().selectedServerId).toBe('server-a');
  });

  it('does not start a queued automatic test after its StrictMode sheet unmounts', async () => {
    const testConnection = vi.fn();
    setGpuWatcherBridge({ listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)), testConnection });
    const view = renderWithQueryClient(<StrictMode><ModalHost action="test" target="server-b" /></StrictMode>);
    act(() => view.queryClient.setQueryData(queryKeys.servers, servers));
    fireEvent.click(screen.getByRole('button', { name: 'Open manager' }));
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(testConnection).not.toHaveBeenCalled();
  });

  it('moves a chosen import candidate into the editor without saving or testing', async () => {
    const saveServer = vi.fn();
    const testConnection = vi.fn();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(servers)),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(settingsSshConfigImportResult)),
      saveServer, testConnection
    });
    openModal('import');
    fireEvent.click(await screen.findByRole('button', { name: 'Import from SSH config' }));
    await screen.findByRole('table', { name: 'SSH config import candidate ledger' });
    fireEvent.click(screen.getByRole('button', { name: 'Use gpu-prod' }));
    await screen.findByRole('dialog', { name: '서버 추가' });
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'gpu-prod');
    expect(screen.getByLabelText('Username')).toHaveProperty('value', 'alice');
    expect(screen.queryByRole('table', { name: 'SSH config import candidate ledger' })).toBeNull();
    expect(saveServer).not.toHaveBeenCalled();
    expect(testConnection).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Host'), { key: 'Escape' });
    await screen.findByRole('alertdialog', { name: /미저장 변경/ });
  });

  it('returns focus to the add trigger when the original invoker disappears', async () => {
    renderWithQueryClient(<ModalHost />);
    const invoker = document.createElement('button');
    invoker.textContent = 'Temporary invoker';
    document.body.append(invoker);
    invoker.focus();
    act(() => useUiStore.getState().openServerManager('add'));
    await screen.findByLabelText('Name');
    invoker.remove();
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add fallback' })));
  });

  it('reviews an unsaved import selection on Escape and keeps native checkbox focus', async () => {
    openModal('import');
    fireEvent.click(await screen.findByRole('button', { name: 'Import from SSH config' }));
    const candidate = await screen.findByRole('checkbox', { name: 'Select gpu-prod for bulk import' });
    candidate.focus();
    fireEvent.click(candidate);
    expect(candidate).toHaveProperty('checked', true);
    expect(document.activeElement).toBe(candidate);
    fireEvent.keyDown(candidate, { key: 'Escape' });
    await screen.findByRole('alertdialog', { name: /미저장 변경/ });
    fireEvent.click(screen.getByRole('button', { name: '계속 편집' }));
    expect(await screen.findByRole('checkbox', { name: 'Select gpu-prod for bulk import' })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    fireEvent.click(screen.getByRole('button', { name: '변경 버리기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
