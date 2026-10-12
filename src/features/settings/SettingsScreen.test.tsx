import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsImportPanel } from './SettingsImportPanel';
import { SettingsServerForm } from './SettingsServerForm';
import { getSshImportCandidateDomId } from './settingsModel';
import { useSettingsController } from './useSettingsController';
import { useUiStore } from '../../lib/store';
import type { Server, ServerInput, SshConfigImportResult } from '../../lib/types';
import { okBridgeResponse, setGpuWatcherBridge } from '../../test-utils/bridge';
import { renderWithQueryClient } from '../../test-utils/query';
import { selectedBulkSshConfigImportResult, serverFromInput, serverInput, settingsSshConfigImportResult } from '../../test-utils/server-fixtures';

// Exercise controller contracts independently of the mutually exclusive modal modes.
const SettingsControllerHarness = () => {
  const controller = useSettingsController();

  return (
    <section>
      <button onClick={() => useUiStore.getState().openServerManager('add')} type="button">New server</button>
      <button onClick={controller.requestDelete} type="button">Harness request delete</button>
      <button onClick={controller.confirmDelete} type="button">Harness confirm delete</button>
      {controller.serversQuery.isLoading ? <p>Loading configured servers...</p> : null}
      {controller.serversQuery.error ? <p>{controller.serversQuery.error.message}</p> : null}
      {controller.servers?.map((server) => (
        <section data-server-id={server.id} key={server.id}>
          <span>{server.name}</span>
          <button onClick={() => useUiStore.getState().openServerManager('edit', server.id)} type="button">Select {server.name}</button>
        </section>
      ))}
      <SettingsServerForm {...controller} />
      <SettingsImportPanel {...controller} headingRef={null} />
    </section>
  );
};

const renderSettings = () => renderWithQueryClient(<SettingsControllerHarness />);

const createDeferred = <Result,>() => {
  let resolveDeferred: (value: Result) => void = () => undefined;
  let rejectDeferred: (reason: Error) => void = () => undefined;
  const promise = new Promise<Result>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return { promise, reject: rejectDeferred, resolve: resolveDeferred };
};

const configuredServers: readonly Server[] = [
  serverFromInput({ ...serverInput, id: 'server-a', name: 'Alpha GPU', host: 'alpha.local' }),
  serverFromInput({ ...serverInput, id: 'server-b', name: 'Beta GPU', host: 'beta.local' })
];

const getServerRow = (name: string): HTMLElement => {
  const row = screen.getByText(name).closest('[data-server-id]');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Server row not found: ${name}`);
  }
  return row;
};

const getEditorForm = (): HTMLFormElement => {
  const form = screen.getByRole('button', { name: 'Save server' }).closest('form');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Settings editor form not found');
  }
  return form;
};

const duplicateBulkSshConfigImportResult: SshConfigImportResult = {
  candidates: [
    ...selectedBulkSshConfigImportResult.candidates,
    {
      hostAlias: 'gpu-prod-a-copy',
      hostname: 'resolved-a-copy.internal.example',
      draft: {
        id: null,
        name: 'GPU Prod A Copy',
        host: 'gpu-prod-a',
        port: 2202,
        username: 'alice',
        sshKeyPath: '~/.ssh/id_gpuwatcher',
        pollingIntervalSeconds: 45,
        enabled: true
      },
      warnings: []
    }
  ],
  warnings: ['Include file /Users/alice/.ssh/extra.conf was skipped with token=secret-value']
};

const unsafeAliasImportResult: SshConfigImportResult = {
  candidates: [
    {
      hostAlias: 'gpu prod/blue:22?!',
      hostname: 'unsafe-alias.internal.example',
      draft: {
        id: null,
        name: 'Unsafe Alias GPU',
        host: 'gpu prod/blue:22?!',
        port: 2222,
        username: 'alice',
        sshKeyPath: null,
        pollingIntervalSeconds: null,
        enabled: true
      },
      warnings: ['Host gpu prod/blue:22?! uses unsupported ProxyCommand; import ignores it']
    }
  ],
  warnings: []
};

const BulkImportControllerHarness = () => {
  const controller = useSettingsController();

  return (
    <section>
      <button onClick={() => controller.sshConfigImportMutation.mutate()} type="button">Load SSH config</button>
      <button onClick={controller.selectAllImportableCandidates} type="button">Select all importable</button>
      <button onClick={() => controller.toggleImportCandidateSelection('gpu-prod-b')} type="button">Toggle gpu-prod-b</button>
      <button onClick={() => controller.toggleImportCandidateSelection('missing-user')} type="button">Toggle missing-user</button>
      <button onClick={() => controller.toggleImportCandidateSelection('saved-duplicate')} type="button">Toggle saved-duplicate</button>
      <button onClick={() => controller.saveSelectedImportCandidates()} type="button">Save selected imports</button>
      <div>selected aliases: {controller.selectedImportHostAliases.join(',')}</div>
      <div>metadata rows: {controller.bulkImportCandidateMetadata.length}</div>
      <div>summary: saved {controller.bulkImportSaveResult?.saved.length ?? 0}, skipped {controller.bulkImportSaveResult?.skipped.length ?? 0}, failed {controller.bulkImportSaveResult?.failed.length ?? 0}</div>
      <div>failed aliases: {controller.bulkImportSaveResult?.failed.map((item) => item.candidate.hostAlias).join(',') ?? ''}</div>
      <form onSubmit={controller.submitForm}>
        <input aria-label="Harness name" onChange={(event) => controller.updateField('name', event.target.value)} value={controller.form.name} />
        <input aria-label="Harness host" onChange={(event) => controller.updateField('host', event.target.value)} value={controller.form.host} />
        <input aria-label="Harness username" onChange={(event) => controller.updateField('username', event.target.value)} value={controller.form.username} />
        <button type="submit">Harness save manual</button>
      </form>
    </section>
  );
};

describe('Settings management controller regressions', () => {
  let saveServerBridge: ReturnType<typeof vi.fn<(payload: { input: ServerInput }) => Promise<{ ok: true; data: Server }>>>;

  beforeEach(() => {
    useUiStore.setState({ selectedServerId: null });
    useUiStore.getState().openServerManager('add');
    saveServerBridge = vi.fn().mockImplementation((payload: { input: ServerInput }) =>
      Promise.resolve({ ok: true, data: serverFromInput(payload.input) })
    );
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      saveServer: saveServerBridge
    });
  });

  it('states no-install SSH requirements and omits legacy command copy', async () => {
    renderSettings();

    expect(await screen.findByText('Remote host requirements')).toBeDefined();
    expect(screen.getByText('No GPUWatcher or nvitop install required on the remote host.')).toBeDefined();
    expect(screen.getByText(/NVIDIA driver with/)).toBeDefined();
    expect(screen.getByText('nvidia-smi')).toBeDefined();
    expect(screen.getAllByText(/key-based SSH access/).length).toBeGreaterThan(0);
    expect(screen.getByText(/POSIX shell/)).toBeDefined();
    expect(screen.getByText('ps')).toBeDefined();
    expect(screen.queryByText(/gpuwatcher --json/i)).toBeNull();
    expect(screen.queryByText(/collector command/i)).toBeNull();
    expect(screen.queryByLabelText(/collector command/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/gpuwatcher --json/i)).toBeNull();
  });

  it('splits the server editor into semantic sections and keeps danger zone edit-only', async () => {
    // Given: the Settings screen starts on a new unsaved server form.
    const { unmount } = renderSettings();

    // When: the editor surface is inspected through accessible groups and regions.
    await screen.findByText('Remote host requirements');
    const editorForm = getEditorForm();

    // Then: the editor exposes the T6 section contract and keeps destructive controls out of new-server mode.
    expect(editorForm.noValidate).toBe(true);
    expect(within(editorForm).getByRole('group', { name: 'Identity' })).toBeDefined();
    expect(within(editorForm).getByRole('group', { name: 'SSH connection' })).toBeDefined();
    expect(within(editorForm).getByRole('group', { name: 'Polling' })).toBeDefined();
    expect(within(editorForm).getByRole('region', { name: 'Remote requirements' })).toBeDefined();
    expect(within(editorForm).getByRole('region', { name: 'Connection test' })).toBeDefined();
    expect(within(editorForm).getByRole('group', { name: 'Actions' })).toBeDefined();
    expect(within(editorForm).queryByRole('region', { name: 'Danger zone' })).toBeNull();

    // When: a saved server is edited.
    unmount();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');

    // Then: destructive actions are isolated in an edit-only danger zone.
    expect(within(getEditorForm()).getByRole('region', { name: 'Danger zone' })).toBeDefined();
  });

  it('renders controlled field validation with helper and error ownership', async () => {
    // Given: the new server form has invalid controlled values.
    renderSettings();
    await screen.findByText('Remote host requirements');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('SSH port'), { target: { value: '70000' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('SSH key path'), { target: { value: '-----BEGIN OPENSSH PRIVATE KEY-----\nsecret' } });
    fireEvent.change(screen.getByLabelText('Polling interval seconds'), { target: { value: '0' } });

    // When: the form is submitted through the controlled validation path.
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));

    // Then: field-owned errors wire deterministic IDs, aria-invalid, and described-by helper/error text.
    const nameInput = screen.getByLabelText('Name');
    const hostInput = screen.getByLabelText('Host');
    const portInput = screen.getByLabelText('SSH port');
    const usernameInput = screen.getByLabelText('Username');
    const keyPathInput = screen.getByLabelText('SSH key path');
    const pollingInput = screen.getByLabelText('Polling interval seconds');
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    expect(nameInput.getAttribute('aria-describedby')).toBe('settings-name-helper settings-name-error');
    expect(hostInput.getAttribute('aria-invalid')).toBe('true');
    expect(portInput.getAttribute('aria-invalid')).toBe('true');
    expect(usernameInput.getAttribute('aria-invalid')).toBe('true');
    expect(keyPathInput.getAttribute('aria-invalid')).toBe('true');
    expect(pollingInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Server name is required.').getAttribute('id')).toBe('settings-name-error');
    expect(screen.getByText('Host is required.').getAttribute('id')).toBe('settings-host-error');
    expect(screen.getByText('SSH port must be between 1 and 65535.').getAttribute('id')).toBe('settings-port-error');
    expect(screen.getByText('Username is required.').getAttribute('id')).toBe('settings-username-error');
    expect(screen.getByText('SSH key path must be a filesystem path, not private key material.').getAttribute('id')).toBe('settings-sshKeyPath-error');
    expect(screen.getByText('Polling interval must be between 1 and 86400.').getAttribute('id')).toBe('settings-pollingIntervalSeconds-error');
    expect(saveServerBridge).not.toHaveBeenCalled();
  });

  it('keeps enabled label clicks wired to the controlled checkbox', async () => {
    // Given: the new server form starts enabled.
    renderSettings();
    await screen.findByText('Remote host requirements');
    const enabledInput = screen.getByLabelText('Enabled');
    expect(enabledInput).toHaveProperty('checked', true);

    // When: the visible label text is clicked instead of the checkbox box.
    fireEvent.click(screen.getByText('Enabled'));

    // Then: the controlled checkbox toggles through its label association.
    expect(enabledInput).toHaveProperty('checked', false);
  });

  it('keeps connection testing secondary, explains unsaved disablement, and renders pending and success states', async () => {
    // Given: an unsaved server form cannot be tested yet.
    const testRequest = createDeferred<ReturnType<typeof okBridgeResponse<{ readonly ok: true; readonly status: 'online'; readonly errorType: null; readonly message: string }>>>();
    const testConnectionBridge = vi.fn().mockReturnValue(testRequest.promise);
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([{ ...serverFromInput(serverInput), id: 'server-1' }])),
      saveServer: saveServerBridge,
      testConnection: testConnectionBridge
    });
    renderSettings();
    await screen.findByText('Remote host requirements');

    // Then: save is primary, test is secondary and visibly blocked until a server is saved.
    expect(screen.getByRole('button', { name: 'Save server' }).className).toContain('btn-primary');
    expect(screen.getByRole('button', { name: 'Test SSH connection' }).className).toContain('btn-secondary');
    expect(screen.getByRole('button', { name: 'Test SSH connection' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Save this server before testing the SSH connection.')).toBeDefined();

    // When: a saved server is selected and the test request is pending.
    await screen.findByText('Saved GPU');
    fireEvent.click(within(getServerRow('Saved GPU')).getByRole('button', { name: 'Select Saved GPU' }));
    await screen.findByDisplayValue('Saved GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));

    // Then: the pending state is owned by the connection test region and success is sanitized when it returns.
    expect(within(screen.getByRole('region', { name: 'Connection test' })).getByText('Connection test pending')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Test SSH connection' })).toHaveProperty('disabled', true);
    await act(async () => testRequest.resolve(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'SSH ready for /Users/alice/.ssh/id_ed25519' })));
    expect(await screen.findByText('SSH ready for [path redacted]')).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
  });

  it('exposes the smoke-compatible SSH config import region and scan action', async () => {
    // Given: the Settings screen has loaded its static server form surface.
    renderSettings();

    // When: the SSH config import workspace is discovered through its accessible name.
    const importRegion = await screen.findByRole('region', { name: 'SSH config import' });

    // Then: the smoke selector and user-facing scan action identify the same workspace.
    expect(importRegion.getAttribute('aria-labelledby')).toBe('ssh-config-import-heading');
    expect(within(importRegion).getByRole('button', { name: 'Import from SSH config' })).toBeDefined();
  });

  it('keeps server-query loading and errors observable without inventing saved rows', async () => {
    // Given: the server registry is first loading, then fails before known data exists.
    const listServersRequest = createDeferred<ReturnType<typeof okBridgeResponse<readonly Server[]>>>();
    setGpuWatcherBridge({
      listServers: vi.fn().mockReturnValue(listServersRequest.promise),
      saveServer: saveServerBridge
    });
    renderSettings();

    // When: the initial registry query is still loading.
    expect(await screen.findByText('Loading configured servers...')).toBeDefined();

    // Then: no saved target is invented while manual editing stays available.
    expect(screen.queryByText('Alpha GPU')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', false);

    // When: the registry query fails before a known list exists.
    await act(async () => listServersRequest.reject(new Error('Registry unavailable')));
    expect(await screen.findByText('Registry unavailable')).toBeDefined();

    // Then: the query owns one error without inventing a saved target.
    expect(screen.queryByText('Alpha GPU')).toBeNull();
    expect(screen.getAllByText('Registry unavailable')).toHaveLength(1);
  });

  it('renders SSH config import outside the editor form', async () => {
    // Given: the Settings screen has loaded both the editor and SSH config import workspace.
    renderSettings();

    // When: the editor form and import region are located through their public controls.
    const importRegion = await screen.findByRole('region', { name: 'SSH config import' });
    const editorForm = getEditorForm();

    // Then: the import workspace is a sibling workspace, not a descendant of the editor form.
    expect(editorForm.contains(importRegion)).toBe(false);
  });

  it('retains scoped editor and import-ledger layout hooks', async () => {
    // Given: the Settings screen renders configured rows plus an import preview ledger.
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(settingsSshConfigImportResult)),
      saveServer: saveServerBridge
    });
    renderSettings();

    // When: the Settings workspaces and SSH import ledger are visible.
    await screen.findByText('Alpha GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    const editorForm = getEditorForm();
    const importRegion = await screen.findByRole('region', { name: 'SSH config import' });
    const importLedger = await screen.findByRole('table', { name: 'SSH config import candidate ledger' });

    // Then: T8 CSS can target Settings-specific surfaces without broad screen selectors.
    expect(editorForm.className).toContain('settings-editor');
    expect(within(editorForm).getByRole('group', { name: 'SSH connection' }).className).toContain('settings-editor-section');
    expect(importRegion.className).toContain('settings-import-workspace');
    expect(importLedger.className).toContain('settings-import-ledger-table');
  });

  it('saves only the server input fields accepted by the API', async () => {
    renderSettings();

    await screen.findByText('Remote host requirements');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Lab host ' } });
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: ' lab.example.test ' } });
    fireEvent.change(screen.getByLabelText('SSH port'), { target: { value: '2222' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' alice ' } });
    fireEvent.change(screen.getByLabelText('Polling interval seconds'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));

    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledWith(expect.any(Object)));
    const saveCall = saveServerBridge.mock.calls[0];
    if (!saveCall) {
      throw new Error('saveServer was not invoked');
    }
    const input = (saveCall[0] as { input: ServerInput }).input;
    expect(input).toEqual({
      id: null,
      name: 'Lab host',
      host: 'lab.example.test',
      port: 2222,
      username: 'alice',
      sshKeyPath: null,
      pollingIntervalSeconds: null,
      enabled: true
    });
    expect(input).not.toHaveProperty('collectorCommand');
    expect(JSON.stringify(saveCall[0])).not.toContain('collectorCommand');
    expect(JSON.stringify(saveCall[0])).not.toContain('gpuwatcher --json');
  });

  it('imports an SSH config candidate into the existing form without persisting preview metadata', async () => {
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(settingsSshConfigImportResult));
    const testConnectionBridge = vi.fn();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge,
      testConnection: testConnectionBridge
    });
    renderSettings();

    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));

    expect(await screen.findByText('SSH config import candidates')).toBeDefined();
    expect(listSshConfigHostsBridge).toHaveBeenCalledTimes(1);
    expect(listSshConfigHostsBridge).toHaveBeenCalledWith({});
    expect(screen.getAllByText('gpu-prod').length).toBeGreaterThan(0);
    expect(screen.getByText('Host alias')).toBeDefined();
    expect(screen.getByText('gpu01.internal.example')).toBeDefined();
    expect(screen.getByText('Resolved HostName')).toBeDefined();
    expect(screen.getByText('Host gpu-prod uses unsupported ProxyJump; import ignores it')).toBeDefined();
    expect(screen.getByText('Host gpu-prod uses unsupported ProxyCommand; import ignores it')).toBeDefined();
    expect(screen.getAllByText(/\[path redacted\]/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/token=\[redacted\]/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('/Users/alice/.ssh/bastion.pem')).toBeNull();
    expect(screen.queryByText('secret-value')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Use gpu-prod' }));

    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'GPU Production');
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'gpu-prod');
    expect(screen.getByLabelText('SSH port')).toHaveProperty('value', '2202');
    expect(screen.getByLabelText('Username')).toHaveProperty('value', 'alice');
    expect(screen.getByLabelText('SSH key path')).toHaveProperty('value', '~/.ssh/id_gpuwatcher');
    expect(screen.getByLabelText('Polling interval seconds')).toHaveProperty('value', '45');
    expect(screen.getByLabelText('Enabled')).toHaveProperty('checked', false);
    expect(saveServerBridge).not.toHaveBeenCalled();
    expect(testConnectionBridge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));

    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledWith(expect.any(Object)));
    const saveCall = saveServerBridge.mock.calls[0];
    if (!saveCall) {
      throw new Error('saveServer was not invoked');
    }
    const input = (saveCall[0] as { input: ServerInput }).input;
    expect(input).toEqual({
      id: null,
      name: 'GPU Production',
      host: 'gpu-prod',
      port: 2202,
      username: 'alice',
      sshKeyPath: '~/.ssh/id_gpuwatcher',
      pollingIntervalSeconds: 45,
      enabled: false
    });
    expect(input).not.toHaveProperty('hostname');
    expect(input).not.toHaveProperty('HostName');
    expect(input).not.toHaveProperty('ProxyJump');
    expect(input).not.toHaveProperty('ProxyCommand');
    expect(input).not.toHaveProperty('collectorCommand');
    expect(JSON.stringify(saveCall[0])).not.toContain('gpu01.internal.example');
    expect(JSON.stringify(saveCall[0])).not.toContain('ProxyJump');
    expect(JSON.stringify(saveCall[0])).not.toContain('ProxyCommand');
    expect(JSON.stringify(saveCall[0])).not.toContain('collectorCommand');
    expect(JSON.stringify(saveCall[0])).not.toContain('PRIVATE KEY');
  });

  it('shows backend-unavailable import feedback while manual settings remain usable', async () => {
    renderSettings();

    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));

    expect(await screen.findByText('SSH config import candidates')).toBeDefined();
    expect(screen.getByText('GPUWatcher backend is unavailable. Launch the desktop app to use this action.')).toBeDefined();
    expect(screen.getByText('Remote host requirements')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save server' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Manual host' } });
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'manual-host' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'carol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));

    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledWith(expect.any(Object)));
    const saveCall = saveServerBridge.mock.calls[0];
    if (!saveCall) {
      throw new Error('saveServer was not invoked');
    }
    expect((saveCall[0] as { input: ServerInput }).input).toMatchObject({
      name: 'Manual host',
      host: 'manual-host',
      username: 'carol'
    });
  });

  it('submits the editor from Enter-equivalent form submission without triggering import controls', async () => {
    // Given: the editor form is filled and the SSH import scan bridge is observable.
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(settingsSshConfigImportResult));
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderSettings();
    await screen.findByText('Remote host requirements');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Enter host' } });
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'enter-host' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'dana' } });

    // When: the editor form submits through the same submit path Enter uses in a text input.
    fireEvent.submit(getEditorForm());

    // Then: only the editor save runs; SSH config import controls are not triggered by form submission.
    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledWith(expect.any(Object)));
    expect(listSshConfigHostsBridge).not.toHaveBeenCalled();
  });

  it('renders accessible bulk selection controls with disabled candidate reasons', async () => {
    // Given: an SSH config preview with valid candidates, missing metadata, saved duplicates, duplicate import rows, and sensitive warnings.
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(duplicateBulkSshConfigImportResult));
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([{ ...serverFromInput(serverInput), id: 'saved-server' }])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderSettings();

    // When: the SSH config import preview is loaded and all valid candidates are selected.
    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));

    // Then: each candidate has an accessible checkbox, invalid candidates explain why they cannot be selected, and secrets stay redacted.
    expect(await screen.findByText('SSH config import candidates')).toBeDefined();
    const ledger = screen.getByRole('table', { name: 'SSH config import candidate ledger' });
    const ledgerRows = within(ledger).getAllByRole('row').slice(1);
    expect(ledgerRows.map((row) => within(row).getAllByRole('cell')[1]?.querySelector('div')?.textContent)).toEqual([
      'gpu-prod-a', 'gpu-prod-b', 'missing-user', 'saved-duplicate', 'gpu-prod-a-copy'
    ]);
    expect(screen.getByText('0 of 2 valid hosts selected')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save selected hosts' })).toHaveProperty('disabled', true);
    const firstValid = screen.getByRole('checkbox', { name: 'Select gpu-prod-a for bulk import' });
    const secondValid = screen.getByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' });
    const missingUsername = screen.getByRole('checkbox', { name: 'Select missing-user for bulk import' });
    const savedDuplicate = screen.getByRole('checkbox', { name: 'Select saved-duplicate for bulk import' });
    const importDuplicate = screen.getByRole('checkbox', { name: 'Select gpu-prod-a-copy for bulk import' });
    expect(firstValid).toHaveProperty('checked', false);
    expect(secondValid).toHaveProperty('checked', false);
    expect(missingUsername).toHaveProperty('disabled', true);
    expect(savedDuplicate).toHaveProperty('disabled', true);
    expect(importDuplicate).toHaveProperty('disabled', true);
    expect(missingUsername.getAttribute('aria-describedby')).toBe(getSshImportCandidateDomId('missing-user', 'reason'));
    expect(document.getElementById(getSshImportCandidateDomId('missing-user', 'reason'))?.textContent).toBe('Missing username');
    expect(savedDuplicate.getAttribute('aria-describedby')).toBe(getSshImportCandidateDomId('saved-duplicate', 'reason'));
    expect(importDuplicate.getAttribute('aria-describedby')).toBe(getSshImportCandidateDomId('gpu-prod-a-copy', 'reason'));
    expect(screen.getByText('Missing username')).toBeDefined();
    expect(screen.getByText('Already saved as a configured server')).toBeDefined();
    expect(screen.getByText('Duplicate import candidate')).toBeDefined();
    expect(screen.getAllByText(/token=\[redacted\]/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('/Users/alice/.ssh/extra.conf')).toBeNull();
    expect(screen.queryByText('secret-value')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select all valid hosts' }));

    expect(firstValid).toHaveProperty('checked', true);
    expect(secondValid).toHaveProperty('checked', true);
    expect(screen.getByText('2 of 2 valid hosts selected')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save selected hosts' })).toHaveProperty('disabled', false);
  });

  it('uses safe generated DOM ids for candidate warning descriptions instead of raw aliases', async () => {
    // Given: an SSH config preview contains an alias with spaces and DOM punctuation.
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(unsafeAliasImportResult)),
      saveServer: saveServerBridge
    });
    renderSettings();

    // When: the preview ledger is loaded.
    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));

    // Then: warning descriptions use the deterministic safe helper and never expose the raw alias in DOM ids.
    const rawAlias = 'gpu prod/blue:22?!';
    const expectedWarningId = getSshImportCandidateDomId(rawAlias, 'warnings');
    const checkbox = await screen.findByRole('checkbox', { name: `Select ${rawAlias} for bulk import` });
    expect(checkbox.getAttribute('aria-describedby')).toBe(expectedWarningId);
    expect(expectedWarningId).not.toContain(rawAlias);
    expect(document.getElementById(expectedWarningId)?.textContent).toBe('Host gpu prod/blue:22?! uses unsupported ProxyCommand; import ignores it');
  });

  it('renders sanitized bulk save summary while preserving single-candidate import actions', async () => {
    // Given: two selectable SSH config candidates where the second save fails with sensitive local path text.
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(selectedBulkSshConfigImportResult));
    saveServerBridge.mockImplementation((payload: { input: ServerInput }) => {
      if (payload.input.host === 'gpu-prod-b') {
        return Promise.reject(new Error('Permission denied for /Users/alice/.ssh/id_ed25519 with token=secret-value'));
      }
      return Promise.resolve({ ok: true, data: serverFromInput(payload.input) });
    });
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([{ ...serverFromInput(serverInput), id: 'saved-server' }])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderSettings();

    // When: the existing single-candidate action is used, then the valid bulk set is saved.
    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await screen.findByText('SSH config import candidates');
    fireEvent.click(screen.getByRole('button', { name: 'Use gpu-prod-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all valid hosts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));

    // Then: single-candidate copy still fills the manual form, and bulk summary reports saved/skipped/failed without leaking secrets.
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'GPU Prod A');
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'gpu-prod-a');
    expect(screen.getByLabelText('Username')).toHaveProperty('value', 'alice');
    expect(await screen.findByText('Bulk import summary')).toBeDefined();
    expect(screen.getByText('Saved 1, skipped 0, failed 1.')).toBeDefined();
    expect(screen.getByText(/gpu-prod-b: Permission denied for \[path redacted\] with token=\[redacted\]/)).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-a for bulk import' })).toHaveProperty('checked', false);
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-a for bulk import' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));
    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledTimes(3));
    expect(saveServerBridge.mock.calls[2]?.[0].input.host).toBe('gpu-prod-b');
    expect(saveServerBridge.mock.calls.filter(([payload]) => payload.input.host === 'gpu-prod-a')).toHaveLength(1);
    expect(screen.getByRole('table', { name: 'SSH config import candidate ledger' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Use gpu-prod-a' })).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.queryByText('secret-value')).toBeNull();
  });

  it('clears prior selection and failure summary when a rescan resolves the same alias to a new target', async () => {
    const firstScan: SshConfigImportResult = {
      candidates: selectedBulkSshConfigImportResult.candidates.filter((candidate) => candidate.hostAlias === 'gpu-prod-b'),
      warnings: []
    };
    const secondScan: SshConfigImportResult = {
      candidates: firstScan.candidates.map((candidate) => ({
        ...candidate,
        hostname: 'new-b.internal.example',
        draft: { ...candidate.draft, host: 'new-b-target', username: 'new-user' }
      })),
      warnings: []
    };
    const listSshConfigHostsBridge = vi.fn()
      .mockResolvedValueOnce(okBridgeResponse(firstScan))
      .mockResolvedValueOnce(okBridgeResponse(secondScan));
    saveServerBridge.mockRejectedValueOnce(new Error('Old target save failed'));
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderSettings();
    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));
    await screen.findByText('Saved 0, skipped 0, failed 1.');
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' })).toHaveProperty('checked', true);

    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await screen.findByText('new-b.internal.example');
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' })).toHaveProperty('checked', false);
    expect(screen.queryByText('Bulk import summary')).toBeNull();
    expect(screen.queryByText(/Old target save failed/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save selected hosts' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));
    expect(saveServerBridge).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));
    await screen.findByText('Saved 1, skipped 0, failed 0.');
    expect(saveServerBridge).toHaveBeenCalledTimes(2);
    expect(saveServerBridge.mock.calls[1]?.[0].input).toMatchObject({
      id: null, host: 'new-b-target', username: 'new-user', enabled: false
    });
  });

  it('keeps successfully imported servers excluded after clearing rescan results with a stale registry', async () => {
    const scan: SshConfigImportResult = {
      candidates: selectedBulkSshConfigImportResult.candidates.filter((candidate) => ['gpu-prod-a', 'gpu-prod-b'].includes(candidate.hostAlias)),
      warnings: []
    };
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(scan));
    saveServerBridge.mockImplementation((payload: { input: ServerInput }) => payload.input.host === 'gpu-prod-b'
      ? Promise.reject(new Error('B not saved yet'))
      : Promise.resolve(okBridgeResponse(serverFromInput(payload.input))));
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderSettings();
    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await screen.findByRole('checkbox', { name: 'Select gpu-prod-a for bulk import' });
    fireEvent.click(screen.getByRole('button', { name: 'Select all valid hosts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));
    await screen.findByText('Saved 1, skipped 0, failed 1.');

    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await waitFor(() => expect(screen.queryByText('Bulk import summary')).toBeNull());
    expect(listSshConfigHostsBridge).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-a for bulk import' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('checkbox', { name: 'Select gpu-prod-b for bulk import' })).toHaveProperty('checked', false);
    expect(screen.getByRole('button', { name: 'Save selected hosts' })).toHaveProperty('disabled', true);

    saveServerBridge.mockImplementation((payload: { input: ServerInput }) => Promise.resolve(okBridgeResponse(serverFromInput(payload.input))));
    fireEvent.click(screen.getByRole('button', { name: 'Select all valid hosts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected hosts' }));
    await screen.findByText('Saved 1, skipped 0, failed 0.');
    expect(saveServerBridge.mock.calls.map(([payload]) => payload.input.host)).toEqual(['gpu-prod-a', 'gpu-prod-b', 'gpu-prod-b']);
  });

  it('renders connection diagnostics guidance for known and unknown test failures', async () => {
    // Given: a saved server whose connection tests return typed diagnostics from the desktop backend.
    const testConnectionBridge = vi
      .fn()
      .mockResolvedValueOnce(okBridgeResponse({ ok: false, status: 'error', errorType: 'ssh_auth_failed', message: 'Permission denied for /Users/alice/.ssh/id_ed25519' }))
      .mockResolvedValueOnce(okBridgeResponse({ ok: false, status: 'error', errorType: 'ssh_host_key_failed', message: 'Host key verification failed' }))
      .mockResolvedValueOnce(okBridgeResponse({ ok: false, status: 'error', errorType: 'backend_unavailable', message: null }))
      .mockResolvedValueOnce(okBridgeResponse({ ok: false, status: 'error', errorType: 'mystery_backend_error', message: null }));
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([{ ...serverFromInput(serverInput), id: 'server-1' }])),
      saveServer: saveServerBridge,
      testConnection: testConnectionBridge
    });
    useUiStore.getState().openServerManager('edit', 'server-1');
    renderSettings();

    // When: each failing diagnostic is surfaced through the Settings connection test result.
    await screen.findByDisplayValue('Saved GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));

    // Then: the bounded result shows label, type, sanitized message, and formatter guidance.
    expect(await screen.findByText('SSH authentication failed')).toBeDefined();
    expect(screen.getByText('Type: ssh_auth_failed')).toBeDefined();
    expect(screen.getByText(/Permission denied for \[path redacted\]/)).toBeDefined();
    expect(screen.getByText(/unlock the key in ssh-agent/)).toBeDefined();
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));
    expect(await screen.findByText('SSH host key check failed')).toBeDefined();
    expect(screen.getByText('Type: ssh_host_key_failed')).toBeDefined();
    expect(screen.getByText(/known_hosts/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));
    expect(await screen.findByText('Desktop backend unavailable')).toBeDefined();
    expect(screen.getByText('Type: backend_unavailable')).toBeDefined();
    expect(screen.getByText('Message: unknown')).toBeDefined();
    expect(screen.getByText(/Launch GPUWatcher as the Electron desktop app/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));
    expect(await screen.findByText('Unknown diagnostic')).toBeDefined();
    expect(screen.getByText('Type: unknown')).toBeDefined();
    expect(screen.getByText(/Review the sanitized error message/)).toBeDefined();
  });

  it('saves only selected importable SSH config candidates as disabled create payloads', async () => {
    // Given: an SSH config preview with valid, missing-username, and saved-duplicate candidates.
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(selectedBulkSshConfigImportResult));
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([{ ...serverFromInput(serverInput), id: 'saved-server' }])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderWithQueryClient(<BulkImportControllerHarness />);

    // When: all importable candidates are selected, one valid candidate is unselected, and selected imports are saved.
    fireEvent.click(screen.getByRole('button', { name: 'Load SSH config' }));
    await screen.findByText('metadata rows: 4');
    fireEvent.click(screen.getByRole('button', { name: 'Select all importable' }));
    expect(screen.getByText('selected aliases: gpu-prod-a,gpu-prod-b')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle gpu-prod-b' }));
    expect(screen.getByText('selected aliases: gpu-prod-a')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save selected imports' }));

    // Then: saveServer is called once for the remaining selected valid candidate, with no preview metadata.
    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledTimes(1));
    const saveCall = saveServerBridge.mock.calls[0];
    if (!saveCall) {
      throw new Error('saveServer was not invoked');
    }
    const input = (saveCall[0] as { input: ServerInput }).input;
    expect(input).toEqual({
      id: null,
      name: 'GPU Prod A',
      host: 'gpu-prod-a',
      port: 2202,
      username: 'alice',
      sshKeyPath: '~/.ssh/id_gpuwatcher',
      pollingIntervalSeconds: 45,
      enabled: false
    });
    expect(JSON.stringify(saveCall[0])).not.toContain('resolved-a.internal.example');
    expect(JSON.stringify(saveCall[0])).not.toContain('ProxyJump');
    expect(JSON.stringify(saveCall[0])).not.toContain('draft-a');
    expect(screen.getByText('summary: saved 1, skipped 0, failed 0')).toBeDefined();
  });

  it('reports partial bulk-save failures and keeps manual save usable', async () => {
    // Given: selected import candidates where one save fails after another succeeds.
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(selectedBulkSshConfigImportResult));
    saveServerBridge.mockImplementation((payload: { input: ServerInput }) => {
      if (payload.input.host === 'gpu-prod-b') {
        return Promise.reject(new Error('Permission denied for /Users/alice/.ssh/id_ed25519'));
      }
      return Promise.resolve({ ok: true, data: serverFromInput(payload.input) });
    });
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([{ ...serverFromInput(serverInput), id: 'saved-server' }])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderWithQueryClient(<BulkImportControllerHarness />);

    // When: all importable candidates plus invalid selected aliases are saved.
    fireEvent.click(screen.getByRole('button', { name: 'Load SSH config' }));
    await screen.findByText('metadata rows: 4');
    fireEvent.click(screen.getByRole('button', { name: 'Select all importable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle missing-user' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle saved-duplicate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected imports' }));

    // Then: the controller reports saved, skipped, and failed counts without blocking later manual form save.
    await screen.findByText('summary: saved 1, skipped 0, failed 1');
    expect(screen.getByText('failed aliases: gpu-prod-b')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Harness name'), { target: { value: 'Manual after failure' } });
    fireEvent.change(screen.getByLabelText('Harness host'), { target: { value: 'manual-after-failure' } });
    fireEvent.change(screen.getByLabelText('Harness username'), { target: { value: 'carol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Harness save manual' }));

    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledTimes(3));
    const manualCall = saveServerBridge.mock.calls[2];
    if (!manualCall) {
      throw new Error('manual saveServer was not invoked');
    }
    expect((manualCall[0] as { input: ServerInput }).input).toMatchObject({
      id: null,
      name: 'Manual after failure',
      host: 'manual-after-failure',
      username: 'carol',
      enabled: true
    });
  });

  it('preserves editor and saved-list state while owning save failure once', async () => {
    // Given: Alpha is being edited and its save request is deferred.
    const saveRequest = createDeferred<ReturnType<typeof okBridgeResponse<Server>>>();
    saveServerBridge.mockReturnValue(saveRequest.promise);
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');

    // When: the editor submits Alpha.
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));

    // Then: conflicting editor actions are blocked and failure preserves both saved rows.
    await waitFor(() => expect(screen.getByLabelText('Name').closest('fieldset')).toHaveProperty('disabled', true));
    expect(screen.getByRole('button', { name: 'Import from SSH config' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Save server' })).toHaveProperty('disabled', true);
    await act(async () => saveRequest.reject(new Error('Alpha save failed')));
    expect(await screen.findByText('Alpha save failed')).toBeDefined();
    expect(screen.getAllByText('Alpha save failed')).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Alpha GPU');
    expect(screen.getByText('Beta GPU')).toBeDefined();
  });

  it('does not let a late save overwrite a retargeted editor or detail selection', async () => {
    const saveRequest = createDeferred<ReturnType<typeof okBridgeResponse<Server>>>();
    saveServerBridge.mockReturnValue(saveRequest.promise);
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge
    });
    useUiStore.getState().selectServer('server-b');
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Saved Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));
    await waitFor(() => expect(saveServerBridge).toHaveBeenCalledTimes(1));
    act(() => useUiStore.getState().openServerManager('edit', 'server-b'));
    await screen.findByDisplayValue('Beta GPU');
    await act(async () => saveRequest.resolve(okBridgeResponse({ ...configuredServers[0]!, name: 'Saved Alpha' })));
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Beta GPU');
    expect(useUiStore.getState().selectedServerId).toBe('server-b');
    expect(screen.queryByText(/Local configuration saved/)).toBeNull();
  });

  it.each(['switch', 'new'] as const)('ignores a late connection result after a %s changes the form target', async (targetChange) => {
    // Given: Alpha has a connection test in flight.
    const testRequest = createDeferred<ReturnType<typeof okBridgeResponse<{ readonly ok: true; readonly status: 'online'; readonly errorType: null; readonly message: string }>>>();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge,
      testConnection: vi.fn().mockReturnValue(testRequest.promise)
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));

    // When: the editor switches target before Alpha's result arrives.
    if (targetChange === 'switch') {
      fireEvent.click(within(getServerRow('Beta GPU')).getByRole('button', { name: 'Select Beta GPU' }));
      await screen.findByDisplayValue('Beta GPU');
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'New server' }));
      await waitFor(() => expect(screen.getByLabelText('Name')).toHaveProperty('value', ''));
    }
    await act(async () => testRequest.resolve(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'Late Alpha result' })));

    // Then: Alpha's stale result is not rendered for the new target.
    await waitFor(() => expect(screen.queryByText('Late Alpha result')).toBeNull());
  });

  it('ignores a late connection result after an SSH import changes the form target', async () => {
    // Given: Alpha has a connection test in flight and an import candidate is available.
    const testRequest = createDeferred<ReturnType<typeof okBridgeResponse<{ readonly ok: true; readonly status: 'online'; readonly errorType: null; readonly message: string }>>>();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(settingsSshConfigImportResult)),
      saveServer: saveServerBridge,
      testConnection: vi.fn().mockReturnValue(testRequest.promise)
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));

    // When: an imported candidate replaces the editor target before the result arrives.
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await screen.findByText('SSH config import candidates');
    fireEvent.click(screen.getByRole('button', { name: 'Use gpu-prod' }));
    await act(async () => testRequest.resolve(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'Late imported-over result' })));

    // Then: the stale connection result stays hidden.
    await waitFor(() => expect(screen.queryByText('Late imported-over result')).toBeNull());
  });

  it('invalidates a delete confirmation when the management target changes', async () => {
    // Given: Alpha is edited and a delete confirmation is opened for it.
    const deleteServerBridge = vi.fn().mockResolvedValue(okBridgeResponse(undefined));
    setGpuWatcherBridge({
      deleteServer: deleteServerBridge,
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // When: selection moves to Beta before the pending confirmation is accepted.
    fireEvent.click(within(getServerRow('Beta GPU')).getByRole('button', { name: 'Select Beta GPU' }));
    await screen.findByDisplayValue('Beta GPU');
    expect(screen.queryByRole('button', { name: 'Confirm delete Alpha GPU' })).toBeNull();
    expect(deleteServerBridge).not.toHaveBeenCalled();
  });

  it('requires explicit delete confirmation, restores focus on cancel, and clears the editor after success', async () => {
    // Given: Alpha is edited and delete calls are observable.
    const deleteServerBridge = vi.fn().mockResolvedValue(okBridgeResponse(undefined));
    setGpuWatcherBridge({
      deleteServer: deleteServerBridge,
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');

    // When: delete is requested and then cancelled.
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    const confirmButton = screen.getByRole('button', { name: 'Confirm delete Alpha GPU' });

    // Then: focus moves into confirmation, and no backend delete runs before explicit confirmation.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(confirmButton).toHaveProperty('disabled', false);
    expect(deleteServerBridge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(deleteServerBridge).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));

    // When: the confirmation is opened again and accepted.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Alpha GPU' }));

    // Then: the captured server is deleted and the editor returns to new-server mode.
    await waitFor(() => expect(deleteServerBridge).toHaveBeenCalledWith({ id: 'server-a' }));
    await waitFor(() => expect(screen.getByText('Add server')).toBeDefined());
    expect(screen.queryByRole('region', { name: 'Danger zone' })).toBeNull();
  });

  it('ignores a late connection result after delete success and renders delete failure once', async () => {
    // Given: Alpha has both a connection test and a delete request in flight.
    const testRequest = createDeferred<ReturnType<typeof okBridgeResponse<{ readonly ok: true; readonly status: 'online'; readonly errorType: null; readonly message: string }>>>();
    const deleteRequest = createDeferred<ReturnType<typeof okBridgeResponse<undefined>>>();
    const deleteFailure = createDeferred<ReturnType<typeof okBridgeResponse<undefined>>>();
    const deleteServerBridge = vi.fn()
      .mockReturnValueOnce(deleteRequest.promise)
      .mockReturnValueOnce(deleteFailure.promise);
    setGpuWatcherBridge({
      deleteServer: deleteServerBridge,
      listServers: vi.fn().mockResolvedValue(okBridgeResponse(configuredServers)),
      saveServer: saveServerBridge,
      testConnection: vi.fn().mockReturnValue(testRequest.promise)
    });
    useUiStore.getState().openServerManager('edit', 'server-a');
    renderSettings();
    await screen.findByDisplayValue('Alpha GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Test SSH connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Harness request delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Harness confirm delete' }));

    // When: deletion succeeds before the stale connection test resolves.
    await act(async () => deleteRequest.resolve(okBridgeResponse(undefined)));
    await act(async () => testRequest.resolve(okBridgeResponse({ ok: true, status: 'online', errorType: null, message: 'Late deleted result' })));

    // Then: the stale result is hidden, and a later delete failure is owned once by the editor.
    await waitFor(() => expect(screen.queryByText('Late deleted result')).toBeNull());
    act(() => useUiStore.getState().openServerManager('edit', 'server-b'));
    await screen.findByDisplayValue('Beta GPU');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Beta GPU' }));
    await act(async () => deleteFailure.reject(new Error('Beta delete failed')));
    expect(await screen.findByText('Beta delete failed')).toBeDefined();
    expect(screen.getAllByText('Beta delete failed')).toHaveLength(1);
  });

  it('does not wipe a dirty editor when the servers query refreshes', async () => {
    // Given: Alpha is loaded, then its name is edited locally.
    const listServersBridge = vi.fn()
      .mockResolvedValueOnce(okBridgeResponse(configuredServers))
      .mockResolvedValue(okBridgeResponse([{ ...configuredServers[0], name: 'Refreshed Alpha' }, configuredServers[1]]));
    setGpuWatcherBridge({ listServers: listServersBridge, saveServer: saveServerBridge });
    useUiStore.getState().openServerManager('edit', 'server-a');
    const { queryClient } = renderSettings();
    await screen.findByDisplayValue('Alpha GPU');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dirty Alpha' } });

    // When: the same server query refreshes with newer backend data.
    await act(async () => queryClient.invalidateQueries({ queryKey: ['servers'] }));
    await waitFor(() => expect(listServersBridge).toHaveBeenCalledTimes(2));
    await screen.findByText('Refreshed Alpha');

    // Then: the dirty editor value remains based on its clean selection baseline.
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Dirty Alpha');
  });

  it('owns an import backend failure once while leaving the manual editor usable', async () => {
    // Given: SSH config import rejects after the Settings editor has loaded.
    const importRequest = createDeferred<ReturnType<typeof okBridgeResponse<SshConfigImportResult>>>();
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: vi.fn().mockReturnValue(importRequest.promise),
      saveServer: saveServerBridge
    });
    renderSettings();
    await screen.findByText('Remote host requirements');

    // When: the import action fails at the backend boundary.
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await act(async () => importRequest.reject(new Error('Import backend unavailable')));

    // Then: import owns one error and does not disable manual editing.
    expect(await screen.findByText('Import backend unavailable')).toBeDefined();
    expect(screen.getAllByText('Import backend unavailable')).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Save server' })).toHaveProperty('disabled', false);
  });
});
