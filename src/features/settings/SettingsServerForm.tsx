import type { FormEvent } from 'react';

import { DiagnosticPanel, StatusBadge } from '../../components/ui';
import { sanitizeMessage } from '../../lib/format';
import type { ConnectionTestResultDto } from '../../lib/types';
import type { SettingsFormState } from './settingsModel';
import { SettingsImportPanel } from './SettingsImportPanel';
import type { useSettingsController } from './useSettingsController';

type SettingsServerFormProps = Pick<
  ReturnType<typeof useSettingsController>,
  | 'bulkImportCandidateMetadata'
  | 'bulkImportSaveMutation'
  | 'bulkImportSaveResult'
  | 'deleteMutation'
  | 'editServer'
  | 'importCandidate'
  | 'importResult'
  | 'saveMutation'
  | 'saveSelectedImportCandidates'
  | 'selectAllImportableCandidates'
  | 'selectedImportHostAliases'
  | 'sshConfigImportMutation'
  | 'testMutation'
  | 'toggleImportCandidateSelection'
  | 'updateField'
> & {
  readonly connectionResult: ConnectionTestResultDto | undefined;
  readonly form: SettingsFormState;
  readonly submitForm: (event: FormEvent<HTMLFormElement>) => void;
};

export const SettingsServerForm = ({
  bulkImportCandidateMetadata,
  bulkImportSaveMutation,
  bulkImportSaveResult,
  connectionResult,
  deleteMutation,
  editServer,
  form,
  importCandidate,
  importResult,
  saveMutation,
  saveSelectedImportCandidates,
  selectAllImportableCandidates,
  selectedImportHostAliases,
  sshConfigImportMutation,
  submitForm,
  testMutation,
  toggleImportCandidateSelection,
  updateField
}: SettingsServerFormProps) => (
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

    <SettingsImportPanel
      bulkImportCandidateMetadata={bulkImportCandidateMetadata}
      bulkImportSaveMutation={bulkImportSaveMutation}
      bulkImportSaveResult={bulkImportSaveResult}
      importCandidate={importCandidate}
      importResult={importResult}
      saveSelectedImportCandidates={saveSelectedImportCandidates}
      selectAllImportableCandidates={selectAllImportableCandidates}
      selectedImportHostAliases={selectedImportHostAliases}
      sshConfigImportMutation={sshConfigImportMutation}
      toggleImportCandidateSelection={toggleImportCandidateSelection}
    />

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
        <input className="input" min="1" onChange={(event) => updateField('pollingIntervalSeconds', event.target.value)} type="number" value={form.pollingIntervalSeconds} />
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
      <button className="btn btn-secondary" disabled={!form.id || testMutation.isPending} onClick={() => form.id && testMutation.mutate(form.id)} type="button">
        Test SSH connection
      </button>
      <button className="btn btn-secondary text-[color:var(--color-error)]" disabled={!form.id || deleteMutation.isPending} onClick={() => form.id && deleteMutation.mutate(form.id)} type="button">
        Delete
      </button>
    </div>

    {connectionResult ? (
      <div className="surface p-4 text-sm">
        <div className="mb-2"><StatusBadge status={connectionResult.status} /></div>
        {connectionResult.ok ? (
          <div>{sanitizeMessage(connectionResult.message)}</div>
        ) : (
          <DiagnosticPanel className="mt-3" errorType={connectionResult.errorType} message={connectionResult.message} title="Connection diagnostic" />
        )}
      </div>
    ) : null}
  </form>
);
