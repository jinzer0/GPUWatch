import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { deleteServer, listServers, queryKeys, saveServer, setServerEnabled, testConnection } from '../../lib/api';
import { formatTime, formatUnknown, sanitizeMessage } from '../../lib/format';
import { useUiStore } from '../../lib/store';
import type { ConnectionTestResultDto, Server, ServerInput } from '../../lib/types';

interface FormState {
  id: string | null;
  name: string;
  host: string;
  port: string;
  username: string;
  sshKeyPath: string;
  pollingIntervalSeconds: string;
  enabled: boolean;
}

const emptyForm: FormState = {
  id: null,
  name: '',
  host: '',
  port: '22',
  username: '',
  sshKeyPath: '',
  pollingIntervalSeconds: '30',
  enabled: true
};

const formFromServer = (server: Server): FormState => ({
  id: server.id,
  name: server.name,
  host: server.host,
  port: String(server.port),
  username: server.username,
  sshKeyPath: server.sshKeyPath ?? '',
  pollingIntervalSeconds: String(server.pollingIntervalSeconds),
  enabled: server.enabled
});

const toServerInput = (form: FormState): ServerInput => ({
  id: form.id,
  name: form.name.trim(),
  host: form.host.trim(),
  port: Number(form.port),
  username: form.username.trim(),
  sshKeyPath: form.sshKeyPath.trim() === '' ? null : form.sshKeyPath.trim(),
  pollingIntervalSeconds: form.pollingIntervalSeconds.trim() === '' ? null : Number(form.pollingIntervalSeconds),
  enabled: form.enabled
});

const containsPrivateKeyMaterial = (value: string) =>
  /-----BEGIN [^-]+PRIVATE KEY-----/i.test(value) || /-----END [^-]+PRIVATE KEY-----/i.test(value) || /[\r\n]/.test(value);

const parseIntegerField = (value: string, label: string, min: number, max: number) => {
  if (!/^\d+$/.test(value.trim())) {
    return `${label} must be a whole number.`;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
};

const validateForm = (form: FormState) => {
  const portError = parseIntegerField(form.port, 'SSH port', 1, 65535);
  if (portError) {
    return portError;
  }
  if (form.pollingIntervalSeconds.trim() !== '') {
    const pollingError = parseIntegerField(form.pollingIntervalSeconds, 'Polling interval', 1, 86_400);
    if (pollingError) {
      return pollingError;
    }
  }
  if (containsPrivateKeyMaterial(form.sshKeyPath)) {
    return 'SSH key path must be a single filesystem path, not private key material.';
  }
  return null;
};

const invalidateSettings = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.processes }),
    queryClient.invalidateQueries({ queryKey: ['server-detail'] })
  ]);

export const SettingsScreen = () => {
  const queryClient = useQueryClient();
  const editingServerId = useUiStore((state) => state.editingServerId);
  const editServer = useUiStore((state) => state.editServer);
  const selectServer = useUiStore((state) => state.selectServer);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const serversQuery = useQuery({ queryKey: queryKeys.servers, queryFn: listServers });
  const servers = serversQuery.data;
  const editingServer = useMemo(
    () => servers?.find((server) => server.id === editingServerId) ?? null,
    [editingServerId, servers]
  );

  const saveMutation = useMutation({
    mutationFn: saveServer,
    onSuccess: (server) => {
      selectServer(server.id);
      editServer(server.id);
      return invalidateSettings(queryClient);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteServer,
    onSuccess: () => {
      editServer(null);
      selectServer(null);
      return invalidateSettings(queryClient);
    }
  });
  const enabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setServerEnabled(id, enabled),
    onSuccess: () => invalidateSettings(queryClient)
  });
  const testMutation = useMutation({
    mutationFn: testConnection
  });
  const resetTestMutation = testMutation.reset;

  useEffect(() => {
    setForm(editingServer ? formFromServer(editingServer) : emptyForm);
    setFormError(null);
    resetTestMutation();
  }, [editingServer, resetTestMutation]);

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setFormError(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    saveMutation.mutate(toServerInput(form));
  };

  const connectionResult: ConnectionTestResultDto | undefined = testMutation.data;
  const mutationError = saveMutation.error ?? deleteMutation.error ?? enabledMutation.error ?? testMutation.error;

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="eyebrow">Settings</div>
        <h2 className="mt-2 font-[var(--font-display)] text-4xl font-black tracking-[-0.08em]">Server registry</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
          Add, edit, delete, enable, disable, and test SSH-backed GPU hosts without storing private key material.
        </p>
      </div>

      {serversQuery.isLoading ? <LoadingState label="Loading configured servers..." /> : null}
      {serversQuery.error ? <ErrorState message={serversQuery.error.message} /> : null}
      {mutationError ? <ErrorState message={sanitizeMessage(mutationError.message)} /> : null}
      {formError ? <ErrorState message={formError} /> : null}

      <div className="grid grid-cols-[1fr_25rem] gap-5">
        <form className="panel space-y-5 p-5" onSubmit={submitForm}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-title">{form.id ? 'Edit server' : 'Add server'}</div>
              <p className="mt-1 text-sm text-[color:var(--color-muted)]">Configure key-based SSH access for a remote NVIDIA host.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => editServer(null)} type="button">
              New
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2 text-sm">
              <span className="metric-label">Name</span>
              <input className="input" onChange={(event) => updateField('name', event.target.value)} required value={form.name} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="metric-label">Host</span>
              <input className="input" onChange={(event) => updateField('host', event.target.value)} required value={form.host} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="metric-label">SSH port</span>
              <input className="input" min="1" onChange={(event) => updateField('port', event.target.value)} required type="number" value={form.port} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="metric-label">Username</span>
              <input className="input" onChange={(event) => updateField('username', event.target.value)} required value={form.username} />
            </label>
            <label className="col-span-2 space-y-2 text-sm">
              <span className="metric-label">SSH key path</span>
              <input className="input" onChange={(event) => updateField('sshKeyPath', event.target.value)} value={form.sshKeyPath} />
            </label>

            <div className="surface col-span-2 p-4 text-sm leading-6 text-[color:var(--color-muted)]">
              <div className="metric-label">Remote host requirements</div>
              <p className="mt-2">No GPUWatcher or nvitop install required on the remote host.</p>
              <p className="mt-2">
                Requires an NVIDIA driver with <code>nvidia-smi</code>, key-based SSH access, a POSIX shell, and <code>ps</code>.
              </p>
            </div>
            <label className="space-y-2 text-sm">
              <span className="metric-label">Polling interval seconds</span>
              <input
                className="input"
                min="1"
                onChange={(event) => updateField('pollingIntervalSeconds', event.target.value)}
                type="number"
                value={form.pollingIntervalSeconds}
              />
            </label>
            <label className="flex items-end gap-3 text-sm text-[color:var(--color-muted)]">
              <input checked={form.enabled} onChange={(event) => updateField('enabled', event.target.checked)} type="checkbox" />
              Enabled
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={saveMutation.isPending} type="submit">
              Save server
            </button>
            <button
              className="btn btn-secondary"
              disabled={!form.id || testMutation.isPending}
              onClick={() => form.id && testMutation.mutate(form.id)}
              type="button"
            >
              Test SSH connection
            </button>
            <button
              className="btn btn-secondary text-[color:var(--color-error)]"
              disabled={!form.id || deleteMutation.isPending}
              onClick={() => form.id && deleteMutation.mutate(form.id)}
              type="button"
            >
              Delete
            </button>
          </div>

          {connectionResult ? (
            <div className="surface p-4 text-sm">
              <div className="mb-2"><StatusBadge status={connectionResult.status} /></div>
              <div>{sanitizeMessage(connectionResult.message)}</div>
              <div className="mt-1 text-[color:var(--color-muted)]">{formatUnknown(connectionResult.errorType)}</div>
            </div>
          ) : null}
        </form>

        <aside className="panel p-5">
          <div className="section-title">Configured servers</div>
          <div className="mt-4 space-y-3">
            {servers && servers.length === 0 ? <EmptyState title="No servers" body="Create a server target to begin polling GPU snapshots." /> : null}
            {servers?.map((server) => (
              <div className="surface p-4" key={server.id}>
                <div className="flex items-start justify-between gap-3">
                  <button className="text-left" onClick={() => editServer(server.id)} type="button">
                    <div className="font-semibold">{server.name}</div>
                    <div className="text-sm text-[color:var(--color-muted)]">{server.username}@{server.host}:{server.port}</div>
                  </button>
                  <StatusBadge status={server.enabled ? 'enabled' : 'disabled'} />
                </div>
                <div className="mt-3 text-xs text-[color:var(--color-muted)]">Updated {formatTime(server.updatedAt)}</div>
                <button
                  className="btn btn-secondary mt-3 w-full"
                  disabled={enabledMutation.isPending}
                  onClick={() => enabledMutation.mutate({ id: server.id, enabled: !server.enabled })}
                  type="button"
                >
                  {server.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
};
