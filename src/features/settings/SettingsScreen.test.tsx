import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsScreen } from './SettingsScreen';
import { useUiStore } from '../../lib/store';
import type { Server, ServerInput } from '../../lib/types';
import { okBridgeResponse, setGpuWatcherBridge } from '../../test-utils/bridge';
import { renderWithQueryClient } from '../../test-utils/query';
import { serverFromInput, settingsSshConfigImportResult } from '../../test-utils/server-fixtures';

const renderSettings = () => renderWithQueryClient(<SettingsScreen />);

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
});
