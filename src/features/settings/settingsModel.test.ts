import { describe, expect, it } from 'vitest';

import type { Server, SshConfigImportCandidate } from '../../lib/types';
import {
  buildBulkImportServerInputs,
  formFromSshConfigCandidate,
  getBulkImportCandidateMetadata,
  getBulkImportDuplicateKey,
  toBulkImportServerInput,
  toServerInput
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
      id: 'existing-server',
      name: 'GPU Production',
      host: 'gpu-prod',
      port: 2202,
      username: 'alice',
      sshKeyPath: '~/.ssh/id_gpuwatcher',
      pollingIntervalSeconds: 45,
      enabled: false
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
      id: null,
      name: 'GPU Import',
      host: 'gpu-import',
      port: 2202,
      username: 'alice',
      sshKeyPath: '~/.ssh/id_gpuwatcher',
      pollingIntervalSeconds: 45,
      enabled: false
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
        id: null,
        name: 'GPU Import',
        host: 'valid-host',
        port: 2202,
        username: 'alice',
        sshKeyPath: '~/.ssh/id_gpuwatcher',
        pollingIntervalSeconds: 45,
        enabled: false
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
