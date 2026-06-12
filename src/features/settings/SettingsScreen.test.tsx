import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsScreen } from './SettingsScreen';
import { useUiStore } from '../../lib/store';
import type { Server, ServerInput } from '../../lib/types';

const serverFromInput = (input: ServerInput): Server => ({
  id: input.id ?? 'server-1',
  name: input.name,
  host: input.host,
  port: input.port,
  username: input.username,
  sshKeyPath: input.sshKeyPath,
  pollingIntervalSeconds: input.pollingIntervalSeconds ?? 30,
  enabled: input.enabled,
  configRevision: 1,
  createdAt: '2026-06-02T00:00:00Z',
  updatedAt: '2026-06-02T00:00:00Z'
});

const renderSettings = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreen />
    </QueryClientProvider>
  );
};

describe('SettingsScreen', () => {
  let saveServerBridge: ReturnType<typeof vi.fn<(payload: { input: ServerInput }) => Promise<{ ok: true; data: Server }>>>;

  beforeEach(() => {
    useUiStore.setState({ editingServerId: null, selectedServerId: null });
    saveServerBridge = vi.fn().mockImplementation((payload: { input: ServerInput }) =>
      Promise.resolve({ ok: true, data: serverFromInput(payload.input) })
    );
    window.gpuwatcher = {
      listServers: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      saveServer: saveServerBridge
    };
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
});
