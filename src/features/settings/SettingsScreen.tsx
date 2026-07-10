import { ErrorState, LoadingState } from '../../components/ui';
import { sanitizeMessage } from '../../lib/format';
import { ConfiguredServersPanel } from './ConfiguredServersPanel';
import { SettingsServerForm } from './SettingsServerForm';
import { useSettingsController } from './useSettingsController';

export const SettingsScreen = () => {
  const controller = useSettingsController();

  return (
    <section className="space-y-6">
      <header className="border-b border-[color:var(--color-line)] pb-5">
        <div className="eyebrow">Settings</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Server registry</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-muted)]">
          Add, edit, delete, enable, disable, and test SSH-backed GPU hosts without storing private key material.
        </p>
      </header>

      {controller.serversQuery.isLoading ? <LoadingState label="Loading configured servers..." /> : null}
      {controller.serversQuery.error ? <ErrorState message={controller.serversQuery.error.message} /> : null}
      {controller.mutationError ? <ErrorState message={sanitizeMessage(controller.mutationError.message)} /> : null}
      {controller.formError ? <ErrorState message={controller.formError} /> : null}

      <div className="grid grid-cols-[1fr_25rem] gap-5">
        <SettingsServerForm
          bulkImportCandidateMetadata={controller.bulkImportCandidateMetadata}
          bulkImportSaveMutation={controller.bulkImportSaveMutation}
          bulkImportSaveResult={controller.bulkImportSaveResult}
          connectionResult={controller.connectionResult}
          deleteMutation={controller.deleteMutation}
          editServer={controller.editServer}
          form={controller.form}
          importCandidate={controller.importCandidate}
          importResult={controller.importResult}
          saveMutation={controller.saveMutation}
          saveSelectedImportCandidates={controller.saveSelectedImportCandidates}
          selectAllImportableCandidates={controller.selectAllImportableCandidates}
          selectedImportHostAliases={controller.selectedImportHostAliases}
          sshConfigImportMutation={controller.sshConfigImportMutation}
          submitForm={controller.submitForm}
          testMutation={controller.testMutation}
          toggleImportCandidateSelection={controller.toggleImportCandidateSelection}
          updateField={controller.updateField}
        />
        <ConfiguredServersPanel editServer={controller.editServer} enabledMutation={controller.enabledMutation} servers={controller.servers} />
      </div>
    </section>
  );
};
