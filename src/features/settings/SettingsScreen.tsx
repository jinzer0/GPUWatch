import { useCallback, useRef } from 'react';

import { Button, ErrorState, LoadingState } from '../../components/ui';
import { ConfiguredServersPanel } from './ConfiguredServersPanel';
import { SettingsImportPanel } from './SettingsImportPanel';
import { SettingsServerForm } from './SettingsServerForm';
import { buildServerRegistrySummary, type ServerRegistrySummary } from './settingsModel';
import { useSettingsController } from './useSettingsController';

const RegistrySummaryStrip = ({ summary }: { readonly summary: ServerRegistrySummary }) => (
  <section aria-label="Registry summary" className="settings-summary surface grid gap-3 p-4 sm:grid-cols-3" role="region">
    <div>
      <div className="metric-label">Registry</div>
      <div className="metric-value">{summary.total} {summary.total === 1 ? 'server' : 'servers'}</div>
    </div>
    <div>
      <div className="metric-label">Monitored</div>
      <div className="metric-value text-[color:var(--color-success)]">{summary.enabled} enabled</div>
    </div>
    <div>
      <div className="metric-label">Paused</div>
      <div className="metric-value text-[color:var(--color-disabled)]">{summary.disabled} disabled</div>
    </div>
  </section>
);

export const SettingsScreen = () => {
  const controller = useSettingsController();
  const importHeadingRef = useRef<HTMLHeadingElement>(null);
  const registrySummary = !controller.serversQuery.isLoading && !controller.serversQuery.error && controller.servers
    ? buildServerRegistrySummary(controller.servers)
    : null;

  const focusImportWorkspace = useCallback(() => {
    const importHeading = importHeadingRef.current;
    if (!importHeading) {
      return;
    }
    const scrollBehavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    importHeading.scrollIntoView?.({ block: 'start', behavior: scrollBehavior });
    importHeading.focus({ preventScroll: true });
  }, []);

  return (
    <section className="settings-screen space-y-6">
      <header className="settings-header border-b border-[color:var(--color-line)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="settings-header-copy">
            <div className="eyebrow">Settings</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Server registry</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
              Add, edit, delete, enable, disable, and test SSH-backed GPU hosts without storing private key material.
            </p>
          </div>
          <div className="settings-header-actions flex flex-wrap gap-3">
            <Button disabled={controller.isSavePending} onClick={() => controller.editServer(null)} type="button" variant="secondary">
              New server
            </Button>
            <Button onClick={focusImportWorkspace} type="button" variant="secondary">
              Import SSH config
            </Button>
          </div>
        </div>
      </header>

      {registrySummary ? <RegistrySummaryStrip summary={registrySummary} /> : null}
      {controller.serversQuery.isLoading ? <LoadingState label="Loading configured servers..." /> : null}
      {controller.serversQuery.error ? <ErrorState message={controller.serversQuery.error.message} /> : null}
      <section aria-label="Server registry workspace" className="settings-registry-workspace grid gap-5">
        <ConfiguredServersPanel
          editServer={controller.editServer}
          enableOperations={controller.enableOperations}
          enableServer={controller.enableServer}
          saveTargetId={controller.saveTargetId}
          selectedServerId={controller.selectedServerId}
          servers={controller.servers}
        />
        <SettingsServerForm
          connectionResult={controller.connectionResult}
          cancelDelete={controller.cancelDelete}
          confirmDelete={controller.confirmDelete}
          connectionTestError={controller.connectionTestError}
          deleteError={controller.deleteError}
          deleteTarget={controller.deleteTarget}
          fieldErrors={controller.fieldErrors}
          form={controller.form}
          isConnectionTestPending={controller.isConnectionTestPending}
          isDeletePending={controller.isDeletePending}
          isSavePending={controller.isSavePending}
          requestDelete={controller.requestDelete}
          saveError={controller.saveError}
          submitForm={controller.submitForm}
          testCurrentConnection={controller.testCurrentConnection}
          updateField={controller.updateField}
        />
      </section>
      <SettingsImportPanel
        bulkImportCandidateMetadata={controller.bulkImportCandidateMetadata}
        bulkImportSaveMutation={controller.bulkImportSaveMutation}
        bulkImportSaveResult={controller.bulkImportSaveResult}
        headingRef={importHeadingRef}
        importCandidate={controller.importCandidate}
        importResult={controller.importResult}
        saveSelectedImportCandidates={controller.saveSelectedImportCandidates}
        selectAllImportableCandidates={controller.selectAllImportableCandidates}
        selectedImportHostAliases={controller.selectedImportHostAliases}
        sshConfigImportMutation={controller.sshConfigImportMutation}
        toggleImportCandidateSelection={controller.toggleImportCandidateSelection}
      />
    </section>
  );
};
