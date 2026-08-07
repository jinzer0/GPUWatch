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

export type SettingsFormField = Exclude<keyof SettingsFormState, 'id'>;
export type SettingsValidationField = Extract<SettingsFormField, 'name' | 'host' | 'port' | 'username' | 'sshKeyPath' | 'pollingIntervalSeconds'>;
export type SettingsFieldErrors = { readonly [Field in SettingsValidationField]?: string };
type MutableSettingsFieldErrors = { -readonly [Field in SettingsValidationField]?: string };

export type SettingsValidationResult = {
  readonly isValid: boolean;
  readonly fieldErrors: SettingsFieldErrors;
};

export type SshImportCandidateDomIdKind = 'reason' | 'warnings';

export type ServerRegistrySummary = {
  readonly total: number;
  readonly enabled: number;
  readonly disabled: number;
};

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

type ServerFormSource = Omit<Server, 'pollingIntervalSeconds'> & {
  readonly pollingIntervalSeconds: number | null;
};

export const formFromServer = (server: ServerFormSource): SettingsFormState => ({
  id: server.id,
  name: server.name,
  host: server.host,
  port: String(server.port),
  username: server.username,
  sshKeyPath: server.sshKeyPath ?? '',
  pollingIntervalSeconds: server.pollingIntervalSeconds === null ? '' : String(server.pollingIntervalSeconds),
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

export const buildServerRegistrySummary = (servers: readonly Server[]): ServerRegistrySummary => {
  const enabled = servers.filter((server) => server.enabled).length;
  return {
    total: servers.length,
    enabled,
    disabled: servers.length - enabled
  };
};

export const getSettingsFieldHelperId = (field: SettingsFormField): string => `settings-${field}-helper`;

export const getSettingsFieldErrorId = (field: SettingsFormField): string => `settings-${field}-error`;

export const getSshImportCandidateDomId = (hostAlias: string, kind: SshImportCandidateDomIdKind): string => {
  const encodedAlias = hostAlias
    .split('')
    .map((character) => character.charCodeAt(0).toString(16))
    .join('-');
  return `ssh-import-${encodedAlias || 'empty'}-${kind}`;
};

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

const containsPrivateKeyMaterial = (value: string): boolean => /-----BEGIN [^-]+PRIVATE KEY-----/i.test(value) || /-----END [^-]+PRIVATE KEY-----/i.test(value);

const parseIntegerField = (value: string, label: string, min: number, max: number): string | null => {
  if (!/^\d+$/.test(value.trim())) {
    return `${label} must be a whole number.`;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
};

export const validateSettingsFormResult = (form: SettingsFormState): SettingsValidationResult => {
  const fieldErrors: MutableSettingsFieldErrors = {};
  if (form.name.trim() === '') {
    fieldErrors.name = 'Server name is required.';
  }
  if (form.host.trim() === '') {
    fieldErrors.host = 'Host is required.';
  }
  if (form.username.trim() === '') {
    fieldErrors.username = 'Username is required.';
  }

  const portError = parseIntegerField(form.port, 'SSH port', 1, 65535);
  if (portError) {
    fieldErrors.port = portError;
  }
  if (form.pollingIntervalSeconds.trim() !== '') {
    const pollingError = parseIntegerField(form.pollingIntervalSeconds, 'Polling interval', 1, 86_400);
    if (pollingError) {
      fieldErrors.pollingIntervalSeconds = pollingError;
    }
  }
  if (containsPrivateKeyMaterial(form.sshKeyPath)) {
    fieldErrors.sshKeyPath = 'SSH key path must be a filesystem path, not private key material.';
  } else if (/[\r\n]/.test(form.sshKeyPath)) {
    fieldErrors.sshKeyPath = 'SSH key path must be a single line.';
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors
  };
};

export const validateSettingsForm = (form: SettingsFormState): string | null => {
  const { fieldErrors } = validateSettingsFormResult(form);
  return fieldErrors.name ?? fieldErrors.host ?? fieldErrors.username ?? fieldErrors.port ?? fieldErrors.pollingIntervalSeconds ?? fieldErrors.sshKeyPath ?? null;
};

export const invalidateSettings = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.processes }),
    queryClient.invalidateQueries({ queryKey: ['server-detail'] })
  ]);
