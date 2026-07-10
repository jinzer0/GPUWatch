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

export type BulkImportSkipReason = 'missing_username' | 'duplicate_saved_server' | 'duplicate_import_candidate';

export interface BulkImportCandidateMetadata {
  readonly candidate: SshConfigImportCandidate;
  readonly duplicateKey: string;
  readonly selectable: boolean;
  readonly skipReasons: readonly BulkImportSkipReason[];
}

export interface BulkImportCandidateMetadataOptions {
  readonly candidates: readonly SshConfigImportCandidate[];
  readonly existingServers: readonly Server[];
}

export interface BulkImportServerInputOptions extends BulkImportCandidateMetadataOptions {
  readonly selectedHostAliases: readonly string[];
}

export interface BulkImportServerInputSelection {
  readonly inputs: readonly ServerInput[];
  readonly skipped: readonly BulkImportCandidateMetadata[];
}

export const getBulkImportDuplicateKey = (input: Pick<ServerInput, 'host' | 'port' | 'username'>) => `${input.host}\u0000${input.username}\u0000${input.port}`;

export const toBulkImportServerInput = (candidate: SshConfigImportCandidate): ServerInput => ({
  ...toServerInput(formFromSshConfigCandidate(candidate)),
  id: null,
  enabled: false
});

export const getBulkImportCandidateMetadata = ({ candidates, existingServers }: BulkImportCandidateMetadataOptions): readonly BulkImportCandidateMetadata[] => {
  const savedKeys = new Set(existingServers.map((server) => getBulkImportDuplicateKey(server)));
  const importKeys = new Set<string>();

  return candidates.map((candidate) => {
    const duplicateKey = getBulkImportDuplicateKey(candidate.draft);
    const skipReasons: BulkImportSkipReason[] = [];
    if (candidate.draft.username.trim() === '') {
      skipReasons.push('missing_username');
    }
    if (savedKeys.has(duplicateKey)) {
      skipReasons.push('duplicate_saved_server');
    }
    if (importKeys.has(duplicateKey)) {
      skipReasons.push('duplicate_import_candidate');
    }
    importKeys.add(duplicateKey);

    return {
      candidate,
      duplicateKey,
      selectable: skipReasons.length === 0,
      skipReasons
    };
  });
};

export const buildBulkImportServerInputs = (options: BulkImportServerInputOptions): BulkImportServerInputSelection => {
  const selectedAliases = new Set(options.selectedHostAliases);
  const selected = getBulkImportCandidateMetadata(options).filter((item) => selectedAliases.has(item.candidate.hostAlias));

  return {
    inputs: selected.filter((item) => item.selectable).map((item) => toBulkImportServerInput(item.candidate)),
    skipped: selected.filter((item) => !item.selectable)
  };
};

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
