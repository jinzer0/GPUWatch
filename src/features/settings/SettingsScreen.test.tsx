import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsScreen } from './SettingsScreen';
import { useSettingsController } from './useSettingsController';
import { useUiStore } from '../../lib/store';
import type { Server, ServerInput, SshConfigImportResult } from '../../lib/types';
import { okBridgeResponse, setGpuWatcherBridge } from '../../test-utils/bridge';
import { renderWithQueryClient } from '../../test-utils/query';
import { selectedBulkSshConfigImportResult, serverFromInput, serverInput, settingsSshConfigImportResult } from '../../test-utils/server-fixtures';

const renderSettings = () => renderWithQueryClient(<SettingsScreen />);

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

describe('SettingsScreen', () => {
  let saveServerBridge: ReturnType<typeof vi.fn<(payload: { input: ServerInput }) => Promise<{ ok: true; data: Server }>>>;

  beforeEach(() => {
    useUiStore.setState({ editingServerId: null, selectedServerId: null });
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
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: listSshConfigHostsBridge,
      saveServer: saveServerBridge
    });
    renderSettings();

    await screen.findByText('Remote host requirements');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));

    expect(await screen.findByText('SSH config import candidates')).toBeDefined();
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
    expect(screen.getByText('Server registry')).toBeDefined();
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
    expect(screen.queryByText('/Users/alice/.ssh/id_ed25519')).toBeNull();
    expect(screen.queryByText('secret-value')).toBeNull();
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
    useUiStore.setState({ editingServerId: 'server-1', selectedServerId: null });
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
    await screen.findByText('summary: saved 1, skipped 2, failed 1');
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
});
