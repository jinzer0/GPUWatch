import type { Ref } from 'react';

import { Button, ResultFeedback } from '../../components/ui';
import { formatUnknown, sanitizeMessage } from '../../lib/format';
import { getSshImportCandidateDomId } from './settingsModel';
import type { BulkImportCandidateMetadata, BulkImportSkipReason } from './settingsModel';
import type { useSettingsController } from './useSettingsController';

type SettingsImportPanelProps = Pick<
  ReturnType<typeof useSettingsController>,
  | 'bulkImportCandidateMetadata'
  | 'bulkImportSaveMutation'
  | 'bulkImportSaveResult'
  | 'importCandidate'
  | 'importResult'
  | 'saveSelectedImportCandidates'
  | 'selectAllImportableCandidates'
  | 'selectedImportHostAliases'
  | 'sshConfigImportMutation'
  | 'toggleImportCandidateSelection'
> & {
  readonly headingRef: Ref<HTMLHeadingElement>;
};

const skipReasonLabels: Record<BulkImportSkipReason, string> = {
  missing_username: 'Missing username',
  duplicate_saved_server: 'Already saved as a configured server',
  duplicate_import_candidate: 'Duplicate import candidate'
};

const skipReasonText = (reasons: readonly BulkImportSkipReason[]) => reasons.map((reason) => skipReasonLabels[reason]).join(', ');

const bulkImportSelectionStatusId = 'settings-import-selection-status';

const candidateDescriptionIds = (metadata: BulkImportCandidateMetadata): string | undefined => {
  const ids = [
    metadata.skipReasons.length > 0 ? getSshImportCandidateDomId(metadata.candidate.hostAlias, 'reason') : null,
    metadata.candidate.warnings.length > 0 ? getSshImportCandidateDomId(metadata.candidate.hostAlias, 'warnings') : null
  ].filter((id): id is string => id !== null);

  return ids.length > 0 ? ids.join(' ') : undefined;
};

const candidateStatusText = (metadata: BulkImportCandidateMetadata): string => metadata.selectable ? 'Ready to import' : skipReasonText(metadata.skipReasons);

export const SettingsImportPanel = ({
  bulkImportCandidateMetadata,
  bulkImportSaveMutation,
  bulkImportSaveResult,
  importCandidate,
  importResult,
  headingRef,
  saveSelectedImportCandidates,
  selectAllImportableCandidates,
  selectedImportHostAliases,
  sshConfigImportMutation,
  toggleImportCandidateSelection
}: SettingsImportPanelProps) => {
  const selectedAliases = new Set(selectedImportHostAliases);
  const validCount = bulkImportCandidateMetadata.filter((item) => item.selectable).length;
  const selectedValidCount = bulkImportCandidateMetadata.filter((item) => item.selectable && selectedAliases.has(item.candidate.hostAlias)).length;
  const canSaveSelection = selectedValidCount > 0 && !bulkImportSaveMutation.isPending;

  return (
    <section aria-labelledby="ssh-config-import-heading" className="settings-import-workspace surface p-4">
      <div className="settings-import-header flex flex-wrap items-start justify-between gap-3">
        <div className="settings-import-copy">
          <h3 className="metric-label" id="ssh-config-import-heading" ref={headingRef} tabIndex={-1}>SSH config import</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted)]">
            Preview OpenSSH host aliases, select valid hosts for disabled bulk creation, or use one candidate to copy it into the manual server form.
          </p>
        </div>
        <Button disabled={sshConfigImportMutation.isPending} onClick={() => sshConfigImportMutation.mutate()} type="button" variant="secondary">
          Import from SSH config
        </Button>
      </div>

      {sshConfigImportMutation.isPending ? (
        <div className="settings-import-feedback mt-4">
          <ResultFeedback label="SSH config import" state="pending" />
        </div>
      ) : null}
      {sshConfigImportMutation.error ? (
        <div className="settings-import-feedback mt-4">
          <ResultFeedback label="SSH config import result" message={sshConfigImportMutation.error.message} state="error" />
        </div>
      ) : null}
      {importResult ? (
        <div className="settings-import-results mt-4 space-y-3" aria-live="polite">
          <div className="settings-import-results-header flex flex-wrap items-end justify-between gap-3">
            <div className="settings-import-results-copy">
              <div className="section-title text-2xl">SSH config import candidates</div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--color-muted)]" id={bulkImportSelectionStatusId}>{selectedValidCount} of {validCount} valid hosts selected</div>
            </div>
            <div className="settings-import-actions flex flex-wrap gap-3">
              <Button aria-describedby={validCount === 0 || bulkImportSaveMutation.isPending ? bulkImportSelectionStatusId : undefined} disabled={validCount === 0 || bulkImportSaveMutation.isPending} onClick={selectAllImportableCandidates} type="button" variant="secondary">
                Select all valid hosts
              </Button>
              <Button aria-describedby={!canSaveSelection ? bulkImportSelectionStatusId : undefined} disabled={!canSaveSelection} onClick={() => void saveSelectedImportCandidates()} type="button" variant="primary">
                Save selected hosts
              </Button>
            </div>
          </div>

          {bulkImportSaveMutation.isPending ? (
            <ResultFeedback label="Saving selected SSH config hosts" state="pending" />
          ) : null}

          {bulkImportSaveResult ? (
            <div className="settings-import-summary surface p-3 text-xs leading-5" role="status" aria-live="polite">
              <div className="settings-import-summary-counts flex flex-wrap items-center gap-3">
                <div className="metric-label">Bulk import summary</div>
                <div className="font-semibold text-[color:var(--color-text)]">
                  Saved {bulkImportSaveResult.saved.length}, skipped {bulkImportSaveResult.skipped.length}, failed {bulkImportSaveResult.failed.length}.
                </div>
              </div>
              {bulkImportSaveResult.failed.length > 0 ? (
                <div className="settings-import-summary-failures mt-2 flex flex-wrap gap-2 text-[color:var(--color-error)]">
                  {bulkImportSaveResult.failed.map((failure) => (
                    <div key={failure.candidate.hostAlias}>{failure.candidate.hostAlias}: {sanitizeMessage(failure.message)}</div>
                  ))}
                </div>
              ) : null}
              {bulkImportSaveResult.skipped.length > 0 ? (
                <div className="settings-import-summary-skips mt-2 flex flex-wrap gap-2 text-[color:var(--color-warning)]">
                  {bulkImportSaveResult.skipped.map((item) => (
                    <div key={item.candidate.hostAlias}>{item.candidate.hostAlias}: {skipReasonText(item.skipReasons)}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {importResult.warnings.length > 0 ? (
            <div className="settings-import-warnings surface border-[color:var(--color-warning)] p-3 text-sm leading-6 text-[color:var(--color-warning)]">
              {importResult.warnings.map((warning) => (
                <div key={warning}>{sanitizeMessage(warning)}</div>
              ))}
            </div>
          ) : null}
          {importResult.candidates.length === 0 ? <div className="settings-import-empty text-sm text-[color:var(--color-muted)]">No importable SSH host aliases found.</div> : null}
          {bulkImportCandidateMetadata.length > 0 ? (
            <div className="settings-import-ledger surface overflow-x-auto">
              <table aria-label="SSH config import candidate ledger" className="settings-import-ledger-table w-full min-w-[58rem] border-collapse text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-3" scope="col">Select</th>
                    <th className="px-3 py-3" scope="col">Host alias</th>
                    <th className="px-3 py-3" scope="col">Resolved HostName</th>
                    <th className="px-3 py-3" scope="col">User</th>
                    <th className="px-3 py-3" scope="col">Port</th>
                    <th className="px-3 py-3" scope="col">Status</th>
                    <th className="px-3 py-3" scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkImportCandidateMetadata.map((metadata) => {
                    const candidate = metadata.candidate;
                    const reasonId = metadata.skipReasons.length > 0 ? getSshImportCandidateDomId(candidate.hostAlias, 'reason') : undefined;
                    const warningId = candidate.warnings.length > 0 ? getSshImportCandidateDomId(candidate.hostAlias, 'warnings') : undefined;

                    return (
                      <tr className="settings-import-ledger-row border-t border-[color:var(--color-line)] align-top" key={candidate.hostAlias}>
                        <td className="px-3 py-3">
                          <input
                            aria-describedby={candidateDescriptionIds(metadata)}
                            aria-label={`Select ${candidate.hostAlias} for bulk import`}
                            checked={metadata.selectable && selectedAliases.has(candidate.hostAlias)}
                            disabled={!metadata.selectable || bulkImportSaveMutation.isPending}
                            onChange={() => toggleImportCandidateSelection(candidate.hostAlias)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="settings-import-alias break-words font-[var(--font-display)] text-xl font-bold tracking-[-0.05em]">{candidate.hostAlias}</div>
                          <div className="settings-import-draft-host mt-1 text-xs text-[color:var(--color-muted)]">Draft host {candidate.draft.host}</div>
                        </td>
                        <td className="px-3 py-3 font-semibold text-[color:var(--color-text)]">{formatUnknown(candidate.hostname)}</td>
                        <td className="px-3 py-3 font-semibold text-[color:var(--color-text)]">{formatUnknown(candidate.draft.username)}</td>
                        <td className="px-3 py-3 font-semibold text-[color:var(--color-text)]">{candidate.draft.port}</td>
                        <td className="px-3 py-3">
                          <div className={metadata.selectable ? 'settings-import-status font-semibold text-[color:var(--color-success)]' : 'settings-import-status font-semibold text-[color:var(--color-warning)]'} id={reasonId}>{candidateStatusText(metadata)}</div>
                          {candidate.warnings.length > 0 ? (
                            <div className="settings-import-candidate-warnings mt-2 space-y-1 text-xs leading-5 text-[color:var(--color-warning)]" id={warningId}>
                              {candidate.warnings.map((warning) => (
                                <div key={warning}>{sanitizeMessage(warning)}</div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <Button aria-label={`Use ${candidate.hostAlias}`} onClick={() => importCandidate(candidate)} size="sm" type="button" variant="primary">
                            Use
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
