import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../lib/api';
import type { Server, ServerInput, SshConfigImportCandidate } from '../../lib/types';

export interface SettingsFormState {
  readonly id: string | null;
  readonly name: string;
  readonly host: string;
  readonly port: string;
  readonly username: string;
  readonly sshKeyPath: string;
  readonly pollingIntervalSeconds: string;
  readonly enabled: boolean;
}

export const emptySettingsForm: SettingsFormState = {
  id: null,
  name: '',
  host: '',
  port: '22',
  username: '',
  sshKeyPath: '',
  pollingIntervalSeconds: '30',
  enabled: true
};

export const formFromServer = (server: Server): SettingsFormState => ({
  id: server.id,
  name: server.name,
  host: server.host,
  port: String(server.port),
  username: server.username,
  sshKeyPath: server.sshKeyPath ?? '',
  pollingIntervalSeconds: String(server.pollingIntervalSeconds),
  enabled: server.enabled
});

export const formFromSshConfigCandidate = (candidate: SshConfigImportCandidate): SettingsFormState => ({
  id: candidate.draft.id,
  name: candidate.draft.name,
  host: candidate.draft.host,
  port: String(candidate.draft.port),
  username: candidate.draft.username,
  sshKeyPath: candidate.draft.sshKeyPath ?? '',
  pollingIntervalSeconds: candidate.draft.pollingIntervalSeconds === null ? '' : String(candidate.draft.pollingIntervalSeconds),
  enabled: candidate.draft.enabled
});

export const toServerInput = (form: SettingsFormState): ServerInput => ({
  id: form.id,
  name: form.name.trim(),
  host: form.host.trim(),
  port: Number(form.port),
  username: form.username.trim(),
  sshKeyPath: form.sshKeyPath.trim() === '' ? null : form.sshKeyPath.trim(),
  pollingIntervalSeconds: form.pollingIntervalSeconds.trim() === '' ? null : Number(form.pollingIntervalSeconds),
  enabled: form.enabled
});

const containsPrivateKeyMaterial = (value: string) => /-----BEGIN [^-]+PRIVATE KEY-----/i.test(value) || /-----END [^-]+PRIVATE KEY-----/i.test(value) || /[\r\n]/.test(value);

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

export const validateSettingsForm = (form: SettingsFormState) => {
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

export const invalidateSettings = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.processes }),
    queryClient.invalidateQueries({ queryKey: ['server-detail'] })
  ]);
