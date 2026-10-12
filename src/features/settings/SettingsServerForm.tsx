import { useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { Button, DiagnosticPanel, ErrorState, ResultFeedback, StatusBadge } from '../../components/ui';
import { sanitizeMessage } from '../../lib/format';
import type { ConnectionTestResultDto } from '../../lib/types';
import { getSettingsFieldErrorId, getSettingsFieldHelperId } from './settingsModel';
import type { SettingsFieldErrors, SettingsFormState, SettingsValidationField } from './settingsModel';
import type { useSettingsController } from './useSettingsController';

const fieldHelpers: Record<SettingsValidationField, string> = {
  host: 'SSH host name, IP address, or OpenSSH host alias reachable from this Mac.',
  name: 'Display name shown in the registry and detail screens.',
  pollingIntervalSeconds: 'Leave blank to use the backend default polling cadence.',
  port: 'OpenSSH port from 1 to 65535.',
  sshKeyPath: 'Optional local filesystem path only. Do not paste private key material.',
  username: 'Remote Linux account used for key-based SSH.'
};

type SettingsTextFieldProps = {
  readonly disabled: boolean;
  readonly error: string | undefined;
  readonly field: SettingsValidationField;
  readonly label: string;
  readonly min?: string;
  readonly onChange: (field: SettingsValidationField, value: string) => void;
  readonly type?: 'number' | 'text';
  readonly value: string;
};

const describedBy = (helperId: string, errorId: string, hasError: boolean) => hasError ? `${helperId} ${errorId}` : helperId;

const connectionTestDisabledReasonId = 'settings-connection-test-disabled-reason';

const SettingsTextField = ({ disabled, error, field, label, min, onChange, type = 'text', value }: SettingsTextFieldProps) => {
  const inputId = `settings-${field}`;
  const helperId = getSettingsFieldHelperId(field);
  const errorId = getSettingsFieldErrorId(field);
  const hasError = typeof error === 'string';
  const required = field === 'name' || field === 'host' || field === 'port' || field === 'username';

  return (
    <div className="settings-field space-y-2 text-sm">
      <label className="metric-label block" htmlFor={inputId}>{label}</label>
      <input
        aria-describedby={describedBy(helperId, errorId, hasError)}
        aria-invalid={hasError ? 'true' : undefined}
        aria-required={required || undefined}
        className="input"
        disabled={disabled}
        id={inputId}
        min={min}
        onChange={(event) => onChange(field, event.target.value)}
        required={required}
        type={type}
        value={value}
      />
      <p className="settings-field-helper text-xs leading-5 text-[color:var(--color-muted)]" id={helperId}>{fieldHelpers[field]}</p>
      {hasError ? <p className="settings-field-error text-xs font-semibold leading-5 text-[color:var(--color-error)]" id={errorId}>{error}</p> : null}
    </div>
  );
};

type EditorSectionProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly title: string;
};

const EditorFieldset = ({ children, className = 'grid grid-cols-2 gap-4', disabled = false, title }: EditorSectionProps) => (
  <fieldset className={`settings-editor-section ${className}`.trim()} disabled={disabled}>
    <legend className="metric-label mb-3">{title}</legend>
    {children}
  </fieldset>
);

type SettingsServerFormProps = Pick<
  ReturnType<typeof useSettingsController>,
  | 'cancelDelete'
  | 'confirmDelete'
  | 'connectionTestError'
  | 'deleteError'
  | 'deleteTarget'
  | 'isConnectionTestPending'
  | 'isDeletePending'
  | 'isSavePending'
  | 'requestDelete'
  | 'saveError'
  | 'testCurrentConnection'
  | 'updateField'
	> & {
	  readonly connectionResult: ConnectionTestResultDto | null;
	  readonly fieldErrors: SettingsFieldErrors;
	  readonly form: SettingsFormState;
	  readonly saveSuccess?: boolean;
	  readonly submitForm: (event: FormEvent<HTMLFormElement>) => void;
	};
	
export const SettingsServerForm = ({
  connectionResult,
  cancelDelete,
  confirmDelete,
  connectionTestError,
	  deleteError,
	  deleteTarget,
	  fieldErrors,
	  form,
  isConnectionTestPending,
  isDeletePending,
  isSavePending,
  requestDelete,
  saveError,
  saveSuccess = false,
  submitForm,
  testCurrentConnection,
	  updateField
	}: SettingsServerFormProps) => {
	  const dangerZoneRef = useRef<HTMLElement>(null);
	  const shouldReturnDeleteFocus = useRef(false);
	  const actionStarted = useRef(false);
	  const saveFeedbackRef = useRef<HTMLParagraphElement>(null);
	  const mutationPending = isSavePending || isDeletePending || isConnectionTestPending;
	  const canTestConnection = form.id !== null;

	  useEffect(() => {
	    if (deleteTarget) {
	      dangerZoneRef.current?.querySelector<HTMLButtonElement>('[data-delete-cancel="true"]')?.focus();
	      return;
	    }
	    if (shouldReturnDeleteFocus.current && !mutationPending) {
	      shouldReturnDeleteFocus.current = false;
	      dangerZoneRef.current?.querySelector<HTMLButtonElement>('[data-delete-request="true"]')?.focus();
	    }
	  }, [deleteTarget, mutationPending]);

	  useEffect(() => {
	    if (saveSuccess) saveFeedbackRef.current?.scrollIntoView?.({ block: 'nearest' });
	  }, [saveSuccess]);

	  const runAction = (action: () => void) => {
	    if (mutationPending || actionStarted.current) {
	      return;
	    }
	    actionStarted.current = true;
	    try {
	      action();
	    } finally {
	      queueMicrotask(() => { actionStarted.current = false; });
	    }
	  };

	  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
	    event.preventDefault();
	    runAction(() => submitForm(event));
	  };

	  const handleRequestDelete = () => {
	    if (!mutationPending && !actionStarted.current) {
	      requestDelete();
	    }
	  };

	  const handleCancelDelete = () => {
	    if (isDeletePending) {
	      return;
	    }
	    shouldReturnDeleteFocus.current = true;
	    cancelDelete();
	  };

	  return (
    <form aria-busy={mutationPending} className="settings-editor space-y-5" noValidate onSubmit={handleSubmit}>
      <div className="settings-editor-copy">
	        <div className="section-title">{form.id ? 'Edit server' : 'Add server'}</div>
	        <p className="mt-1 text-sm leading-6 text-[color:var(--color-muted)]">Configure key-based SSH access for a remote NVIDIA host.</p>
	      </div>

	      <EditorFieldset className="grid gap-4" disabled={isSavePending} title="Identity">
	        <SettingsTextField disabled={isSavePending} error={fieldErrors.name} field="name" label="Name" onChange={updateField} value={form.name} />
	      </EditorFieldset>

	      <EditorFieldset disabled={isSavePending} title="SSH connection">
	        <SettingsTextField disabled={isSavePending} error={fieldErrors.host} field="host" label="Host" onChange={updateField} value={form.host} />
	        <SettingsTextField disabled={isSavePending} error={fieldErrors.port} field="port" label="SSH port" min="1" onChange={updateField} type="number" value={form.port} />
	        <SettingsTextField disabled={isSavePending} error={fieldErrors.username} field="username" label="Username" onChange={updateField} value={form.username} />
        <div className="settings-editor-wide-field col-span-2">
	          <SettingsTextField disabled={isSavePending} error={fieldErrors.sshKeyPath} field="sshKeyPath" label="SSH key path" onChange={updateField} value={form.sshKeyPath} />
	        </div>
	      </EditorFieldset>

	      <EditorFieldset disabled={isSavePending} title="Polling">
	        <SettingsTextField disabled={isSavePending} error={fieldErrors.pollingIntervalSeconds} field="pollingIntervalSeconds" label="Polling interval seconds" min="1" onChange={updateField} type="number" value={form.pollingIntervalSeconds} />
        <div className="settings-toggle-field flex items-end gap-3 text-sm text-[color:var(--color-muted)]">
	          <input checked={form.enabled} disabled={isSavePending} id="settings-enabled" onChange={(event) => updateField('enabled', event.target.checked)} type="checkbox" />
	          <div>
	            <label className="metric-label block" htmlFor="settings-enabled">Enabled</label>
	            <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]" id={getSettingsFieldHelperId('enabled')}>Enabled servers are included in scheduled polling.</p>
	          </div>
	        </div>
	      </EditorFieldset>

      <section aria-labelledby="settings-remote-requirements-heading" className="settings-editor-section settings-remote-requirements text-sm leading-6 text-[color:var(--color-muted)]" role="region">
	        <h3 className="metric-label" id="settings-remote-requirements-heading">Remote requirements</h3>
	        <div className="mt-3 font-semibold text-[color:var(--color-text)]">Remote host requirements</div>
	        <p className="mt-2">No GPUWatcher or nvitop install required on the remote host.</p>
	        <p className="mt-2">
	          Requires an NVIDIA driver with <code>nvidia-smi</code>, key-based SSH access, a POSIX shell, and <code>ps</code>.
	        </p>
	      </section>

      <section aria-labelledby="settings-connection-test-heading" className="settings-editor-section settings-connection-test" role="region">
        <div className="settings-connection-test-header flex flex-wrap items-start justify-between gap-3">
          <div className="settings-connection-test-copy">
	            <h3 className="metric-label" id="settings-connection-test-heading">Connection test</h3>
	            <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted)]">
	              Test the saved SSH target through the desktop helper without changing form values.
	            </p>
	            {!canTestConnection ? <p className="mt-2 text-xs font-semibold text-[color:var(--color-warning)]" id={connectionTestDisabledReasonId}>Save this server before testing the SSH connection.</p> : null}
	          </div>
	          <Button aria-describedby={!canTestConnection ? connectionTestDisabledReasonId : undefined} disabled={!canTestConnection || mutationPending} onClick={() => runAction(testCurrentConnection)} type="button" variant="secondary">
	            Test SSH connection
	          </Button>
	        </div>
        <div className="settings-connection-test-feedback mt-4 space-y-3">
	          {isConnectionTestPending ? <ResultFeedback label="Connection test" state="pending" /> : null}
	          {connectionTestError ? <ErrorState message={sanitizeMessage(connectionTestError.message)} /> : null}
	          {connectionResult ? (
            <div className="settings-connection-result text-sm">
	              <div className="mb-2"><StatusBadge status={connectionResult.status} /></div>
	              {connectionResult.ok ? (
	                <div>{sanitizeMessage(connectionResult.message)}</div>
	              ) : (
	                <DiagnosticPanel className="mt-3" errorType={connectionResult.errorType} message={connectionResult.message} title="Connection diagnostic" />
	              )}
	            </div>
	          ) : null}
	        </div>
	      </section>

      <fieldset className="settings-editor-section settings-actions flex flex-wrap items-center gap-3" disabled={mutationPending}>
	        <legend className="metric-label mb-3">Actions</legend>
	        <Button disabled={mutationPending} type="submit" variant="primary">
	          Save server
	        </Button>
        {saveError ? <div className="settings-action-feedback basis-full"><ErrorState message={sanitizeMessage(saveError.message)} /></div> : null}
	        {saveSuccess ? <p className="settings-action-feedback basis-full text-sm" ref={saveFeedbackRef} role="status">Local configuration saved. SSH connection has not been tested by saving.</p> : null}
	      </fieldset>

	      {form.id ? (
        <section aria-labelledby="settings-danger-zone-heading" className="settings-editor-section settings-danger-zone surface-danger" ref={dangerZoneRef} role="region">
	          <h3 className="metric-label text-[color:var(--color-error)]" id="settings-danger-zone-heading">Danger zone</h3>
	          <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted)]">Delete this saved server from the local registry. Remote hosts are not modified.</p>
          <div className="settings-danger-actions mt-3 flex flex-wrap items-center gap-3 text-sm">
	            {deleteTarget ? (
	              <>
	                <span className="font-semibold text-[color:var(--color-text)]">Delete {deleteTarget.name}?</span>
	                <Button data-delete-confirm="true" disabled={mutationPending} onClick={() => runAction(confirmDelete)} type="button" variant="danger">Confirm delete {deleteTarget.name}</Button>
	                <Button data-delete-cancel="true" disabled={isDeletePending} onClick={handleCancelDelete} type="button" variant="secondary">Cancel delete</Button>
	              </>
	            ) : (
	              <Button data-delete-request="true" disabled={mutationPending} onClick={handleRequestDelete} type="button" variant="danger">
	                Delete
	              </Button>
	            )}
	          </div>
          {deleteError ? <div className="settings-danger-feedback mt-3"><ErrorState message={sanitizeMessage(deleteError.message)} /></div> : null}
	        </section>
	      ) : null}
	    </form>
	  );
	};
