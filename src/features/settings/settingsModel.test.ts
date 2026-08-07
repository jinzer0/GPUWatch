import { describe, expect, it } from 'vitest';

import type { Server, SshConfigImportCandidate } from '../../lib/types';
import {
  buildBulkImportServerInputs,
  buildServerRegistrySummary,
  formFromServer,
  formFromSshConfigCandidate,
  getBulkImportCandidateMetadata,
  getBulkImportDuplicateKey,
  getSettingsFieldErrorId,
  getSettingsFieldHelperId,
  getSshImportCandidateDomId,
  toBulkImportServerInput,
  toServerInput,
  validateSettingsForm,
  validateSettingsFormResult,
  type SettingsFormState,
  type SettingsValidationField
} from './settingsModel';

const candidate: SshConfigImportCandidate = {
  hostAlias: 'gpu-prod',
  hostname: 'gpu01.internal.example',
  draft: {
    id: 'existing-server',
    name: ' GPU Production ',
    host: ' gpu-prod ',
    port: 2202,
    username: ' alice ',
    sshKeyPath: ' ~/.ssh/id_gpuwatcher ',
    pollingIntervalSeconds: 45,
    enabled: false
  },
  warnings: ['Host gpu-prod uses unsupported ProxyJump; import ignores it']
};

const savedServer: Server = {
  id: 'server-saved',
  name: 'Saved GPU',
  host: 'saved-host',
  port: 2222,
  username: 'carol',
  sshKeyPath: null,
  pollingIntervalSeconds: 30,
  enabled: true,
  configRevision: 1,
  createdAt: '2026-07-09T00:00:00Z',
  updatedAt: '2026-07-09T00:00:00Z'
};

const validForm = {
  id: null,
  name: 'GPU Production',
  host: 'gpu-prod',
  port: '22',
  username: 'alice',
  sshKeyPath: '~/.ssh/id_gpuwatcher',
  pollingIntervalSeconds: '30',
  enabled: true
} satisfies SettingsFormState;

const bulkCandidate = (overrides: Partial<SshConfigImportCandidate['draft']> = {}): SshConfigImportCandidate => ({
  hostAlias: 'gpu-import',
  hostname: 'resolved.internal.example',
  draft: {
    id: 'draft-server-id',
    name: 'GPU Import',
    host: 'gpu-import',
    port: 2202,
    username: 'alice',
    sshKeyPath: '~/.ssh/id_gpuwatcher',
    pollingIntervalSeconds: 45,
    enabled: true,
    ...overrides
  },
  warnings: [
    'Host gpu-import uses unsupported ProxyJump; import ignores it',
    'Host gpu-import uses unsupported ProxyCommand; import ignores it',
    '-----BEGIN OPENSSH PRIVATE KEY----- redacted upstream -----END OPENSSH PRIVATE KEY-----'
  ]
});

describe('settingsModel SSH import mapping', () => {
  it('preserves single SSH config candidate draft fields when mapping through the form', () => {
    // Given: a parsed SSH config candidate with preview-only metadata.
    const form = formFromSshConfigCandidate(candidate);

    // When: the existing single-candidate form mapping is converted to ServerInput.
    const input = toServerInput(form);

    // Then: draft server fields are preserved and preview metadata is omitted.
    expect(input).toEqual({
      id: 'existing-server', name: 'GPU Production', host: 'gpu-prod', port: 2202,
      username: 'alice', sshKeyPath: '~/.ssh/id_gpuwatcher', pollingIntervalSeconds: 45, enabled: false
    });
    expect(JSON.stringify(input)).not.toContain('gpu01.internal.example');
    expect(JSON.stringify(input)).not.toContain('ProxyJump');
  });

  it('creates disabled create-only payloads from bulk candidates', () => {
    // Given: a bulk import candidate whose draft tries to carry an id and enabled state.
    const importCandidate = bulkCandidate({ id: 'existing-server', enabled: true });

    // When: the candidate is converted for bulk save.
    const input = toBulkImportServerInput(importCandidate);

    // Then: only ServerInput fields remain, with create-only disabled semantics.
    expect(input).toEqual({
      id: null, name: 'GPU Import', host: 'gpu-import', port: 2202,
      username: 'alice', sshKeyPath: '~/.ssh/id_gpuwatcher', pollingIntervalSeconds: 45, enabled: false
    });
  });

  it('keeps empty-username candidates previewable but unselectable and skipped for bulk save', () => {
    // Given: one valid candidate and one previewable candidate missing the required username.
    const validCandidate = bulkCandidate({ host: 'valid-host', username: 'alice' });
    const missingUsernameCandidate = bulkCandidate({ host: 'missing-user-host', username: '' });

    // When: metadata and selected payloads are built.
    const metadata = getBulkImportCandidateMetadata({ candidates: [validCandidate, missingUsernameCandidate], existingServers: [] });
    const selection = buildBulkImportServerInputs({
      candidates: [validCandidate, missingUsernameCandidate],
      existingServers: [],
      selectedHostAliases: ['gpu-import']
    });

    // Then: the invalid candidate remains in metadata but is not saved.
    expect(metadata).toEqual([
      {
        candidate: validCandidate,
        duplicateKey: 'valid-host\u0000alice\u00002202',
        selectable: true,
        skipReasons: []
      },
      {
        candidate: missingUsernameCandidate,
        duplicateKey: 'missing-user-host\u0000\u00002202',
        selectable: false,
        skipReasons: ['missing_username']
      }
    ]);
    expect(selection.inputs).toEqual([
      {
        id: null, name: 'GPU Import', host: 'valid-host', port: 2202,
        username: 'alice', sshKeyPath: '~/.ssh/id_gpuwatcher', pollingIntervalSeconds: 45, enabled: false
      }
    ]);
    expect(selection.skipped).toEqual([
      {
        candidate: missingUsernameCandidate,
        duplicateKey: 'missing-user-host\u0000\u00002202',
        selectable: false,
        skipReasons: ['missing_username']
      }
    ]);
  });

  it('detects duplicates by host username and port against saved servers and import candidates', () => {
    // Given: candidates colliding with saved state and with each other by draft host, username, and port.
    const savedDuplicate = bulkCandidate({ host: savedServer.host, username: savedServer.username, port: savedServer.port });
    const firstImportDuplicate = bulkCandidate({ name: 'First duplicate', host: 'same-host', username: 'dana', port: 22 });
    const secondImportDuplicate = bulkCandidate({ name: 'Second duplicate', host: 'same-host', username: 'dana', port: 22 });

    // When: bulk metadata is built against the stale saved server list.
    const metadata = getBulkImportCandidateMetadata({
      candidates: [savedDuplicate, firstImportDuplicate, secondImportDuplicate],
      existingServers: [savedServer]
    });
    const selection = buildBulkImportServerInputs({
      candidates: [savedDuplicate, firstImportDuplicate, secondImportDuplicate],
      existingServers: [savedServer],
      selectedHostAliases: ['gpu-import']
    });

    // Then: saved and in-import duplicates are unselectable and skipped.
    expect(getBulkImportDuplicateKey(firstImportDuplicate.draft)).toBe('same-host\u0000dana\u000022');
    expect(metadata.map((item) => item.skipReasons)).toEqual([
      ['duplicate_saved_server'],
      [],
      ['duplicate_import_candidate']
    ]);
    expect(selection.inputs).toEqual([
      {
        id: null,
        name: 'First duplicate',
        host: 'same-host',
        port: 22,
        username: 'dana',
        sshKeyPath: '~/.ssh/id_gpuwatcher',
        pollingIntervalSeconds: 45,
        enabled: false
      }
    ]);
    expect(selection.skipped.map((item) => item.skipReasons)).toEqual([['duplicate_saved_server'], ['duplicate_import_candidate']]);
  });

  it('serializes bulk save payloads without preview metadata or legacy forbidden fields', () => {
    // Given: a valid candidate with resolved HostName, unsupported option warnings, and private-key warning text.
    const importCandidate = bulkCandidate({ enabled: true });

    // When: the selected candidate is converted to the JSON payload sent to saveServer.
    const selection = buildBulkImportServerInputs({ candidates: [importCandidate], existingServers: [], selectedHostAliases: ['gpu-import'] });
    const payloadJson = JSON.stringify({ input: selection.inputs[0] });

    // Then: only sanitized ServerInput JSON remains.
    expect(payloadJson).toBe('{"input":{"id":null,"name":"GPU Import","host":"gpu-import","port":2202,"username":"alice","sshKeyPath":"~/.ssh/id_gpuwatcher","pollingIntervalSeconds":45,"enabled":false}}');
    expect(payloadJson).not.toContain('hostname');
    expect(payloadJson).not.toContain('HostName');
    expect(payloadJson).not.toContain('ProxyJump');
    expect(payloadJson).not.toContain('ProxyCommand');
    expect(payloadJson).not.toContain('collectorCommand');
    expect(payloadJson).not.toContain('PRIVATE KEY');
    expect(payloadJson).not.toContain('resolved.internal.example');
  });
});

describe('settingsModel registry and form mapping', () => {
  it('derives total enabled and disabled counts from known servers', () => {
    // Given: known server data with both enabled states.
    const servers = [savedServer, { ...savedServer, id: 'server-disabled', enabled: false }];

    // When: the registry summary is built.
    // Then: every known server is counted exactly once.
    expect(buildServerRegistrySummary(servers)).toEqual({ total: 2, enabled: 1, disabled: 1 });
  });

  it('maps nullable server fields through an empty form and back to null payloads', () => {
    // Given: server data with no key path or polling interval.
    const server = { ...savedServer, sshKeyPath: null, pollingIntervalSeconds: null };

    // When: the server is mapped through the editable form.
    const form = formFromServer(server);
    const input = toServerInput(form);

    // Then: null values remain empty in the form and null in the payload.
    expect(form.sshKeyPath).toBe('');
    expect(form.pollingIntervalSeconds).toBe('');
    expect(input.sshKeyPath).toBeNull();
    expect(input.pollingIntervalSeconds).toBeNull();
  });
});

describe('settingsModel validation', () => {
  const invalidCases = [
    ['name', { name: '   ' }],
    ['host', { host: '\t' }],
    ['username', { username: ' ' }],
    ['port', { port: '22.5' }],
    ['port', { port: '0' }],
    ['port', { port: '65536' }],
    ['pollingIntervalSeconds', { pollingIntervalSeconds: '1.5' }],
    ['pollingIntervalSeconds', { pollingIntervalSeconds: '0' }],
    ['pollingIntervalSeconds', { pollingIntervalSeconds: '86401' }],
    ['sshKeyPath', { sshKeyPath: '~/.ssh/id_one\n~/.ssh/id_two' }],
    ['sshKeyPath', { sshKeyPath: '-----BEGIN OPENSSH PRIVATE KEY-----' }]
  ] satisfies readonly (readonly [SettingsValidationField, Partial<SettingsFormState>])[];

  it.each(invalidCases)('returns a field error for invalid %s input', (field, patch) => {
    // Given: an otherwise valid form with one malformed field.
    const form = { ...validForm, ...patch };

    // When: structured validation runs.
    const result = validateSettingsFormResult(form);

    // Then: the result is invalid and owns the error under that field.
    expect(result.isValid).toBe(false);
    expect(result.fieldErrors[field]).toEqual(expect.any(String));
  });

  it('accepts empty optional fields and exposes no field errors', () => {
    // Given: valid required fields and empty optional polling and key path fields.
    const form = { ...validForm, pollingIntervalSeconds: '', sshKeyPath: '' };

    // When: structured validation runs.
    const result = validateSettingsFormResult(form);

    // Then: the form is valid without optional-field errors.
    expect(result).toEqual({ isValid: true, fieldErrors: {} });
    expect(validateSettingsForm(form)).toBeNull();
  });

  it('collects errors for every invalid field while preserving the compatibility message', () => {
    // Given: all required fields are blank and both numeric fields are malformed.
    const form = { ...validForm, name: '', host: '', username: '', port: 'x', pollingIntervalSeconds: '-1' };

    // When: structured and compatibility validation run.
    const result = validateSettingsFormResult(form);
    const compatibilityMessage = validateSettingsForm(form);

    // Then: every invalid field is represented and the old caller still receives one message.
    expect(Object.keys(result.fieldErrors)).toEqual(['name', 'host', 'username', 'port', 'pollingIntervalSeconds']);
    expect(compatibilityMessage).toBe(result.fieldErrors.name);
  });
});

describe('settingsModel DOM ids', () => {
  it('builds deterministic helper and error ids for each form field', () => {
    // Given: a stable form field key.
    const field = 'sshKeyPath';

    // When: helper and error ids are requested more than once.
    const helperId = getSettingsFieldHelperId(field);
    const errorId = getSettingsFieldErrorId(field);

    // Then: ids are stable, distinct, and field-addressable.
    expect([helperId, errorId]).toEqual(['settings-sshKeyPath-helper', 'settings-sshKeyPath-error']);
    expect(getSettingsFieldHelperId(field)).toBe(helperId);
    expect(getSettingsFieldErrorId(field)).toBe(errorId);
  });

  it('encodes unsafe SSH aliases into stable candidate DOM ids', () => {
    // Given: an alias containing spaces and DOM-id punctuation.
    const alias = 'GPU prod/blue:22?!';

    // When: candidate reason and warning ids are generated.
    const reasonId = getSshImportCandidateDomId(alias, 'reason');
    const warningId = getSshImportCandidateDomId(alias, 'warnings');

    // Then: ids are deterministic, distinct, and contain only safe characters.
    expect(getSshImportCandidateDomId(alias, 'reason')).toBe(reasonId);
    expect(reasonId).not.toContain(alias);
    expect(reasonId).toMatch(/^[a-z0-9-]+$/);
    expect(warningId).toMatch(/^[a-z0-9-]+$/);
    expect(warningId).not.toBe(reasonId);
  });

  it('keeps empty aliases deterministic and purpose-scoped for candidate descriptions', () => {
    // Given: a parsed SSH config candidate has an empty alias at the DOM-id boundary.
    const alias = '';

    // When: reason and warning description ids are generated.
    const reasonId = getSshImportCandidateDomId(alias, 'reason');
    const warningId = getSshImportCandidateDomId(alias, 'warnings');

    // Then: the fallback segment stays deterministic and the purpose suffixes remain distinct.
    expect(reasonId).toBe('ssh-import-empty-reason');
    expect(warningId).toBe('ssh-import-empty-warnings');
  });
});
