import { Button, ResultFeedback } from '../../components/ui';
import { formatUnknown, sanitizeMessage } from '../../lib/format';
import type { BulkImportSkipReason } from './settingsModel';
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
>;

const skipReasonLabels: Record<BulkImportSkipReason, string> = {
  missing_username: 'Missing username',
  duplicate_saved_server: 'Already saved as a configured server',
  duplicate_import_candidate: 'Duplicate import candidate'
};

const skipReasonText = (reasons: readonly BulkImportSkipReason[]) => reasons.map((reason) => skipReasonLabels[reason]).join(', ');

export const SettingsImportPanel = ({
  bulkImportCandidateMetadata,
  bulkImportSaveMutation,
  bulkImportSaveResult,
  importCandidate,
  importResult,
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
    <section aria-labelledby="ssh-config-import-heading" className="surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="metric-label" id="ssh-config-import-heading">SSH config import</div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted)]">
            Preview OpenSSH host aliases, select valid hosts for disabled bulk creation, or use one candidate to copy it into the manual server form.
          </p>
        </div>
        <Button disabled={sshConfigImportMutation.isPending} onClick={() => sshConfigImportMutation.mutate()} type="button" variant="secondary">
          Import from SSH config
        </Button>
      </div>

      {sshConfigImportMutation.isPending ? (
        <div className="mt-4">
          <ResultFeedback label="SSH config import" state="pending" />
        </div>
      ) : null}
      {sshConfigImportMutation.error ? (
        <div className="mt-4">
          <ResultFeedback label="SSH config import result" message={sshConfigImportMutation.error.message} state="error" />
        </div>
      ) : null}
      {importResult ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="section-title text-2xl">SSH config import candidates</div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--color-muted)]">{selectedValidCount} of {validCount} valid hosts selected</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={validCount === 0 || bulkImportSaveMutation.isPending} onClick={selectAllImportableCandidates} type="button" variant="secondary">
                Select all valid hosts
              </Button>
              <Button disabled={!canSaveSelection} onClick={() => void saveSelectedImportCandidates()} type="button" variant="primary">
                Save selected hosts
              </Button>
            </div>
          </div>

          {bulkImportSaveMutation.isPending ? (
            <ResultFeedback label="Saving selected SSH config hosts" state="pending" />
          ) : null}

          {bulkImportSaveResult ? (
            <div className="surface p-4 text-sm" role="status" aria-live="polite">
              <div className="metric-label">Bulk import summary</div>
              <div className="mt-2 font-semibold text-[color:var(--color-text)]">
                Saved {bulkImportSaveResult.saved.length}, skipped {bulkImportSaveResult.skipped.length}, failed {bulkImportSaveResult.failed.length}.
              </div>
              {bulkImportSaveResult.failed.length > 0 ? (
                <div className="mt-3 space-y-1 text-[color:var(--color-error)]">
                  {bulkImportSaveResult.failed.map((failure) => (
                    <div key={failure.candidate.hostAlias}>{failure.candidate.hostAlias}: {sanitizeMessage(failure.message)}</div>
                  ))}
                </div>
              ) : null}
              {bulkImportSaveResult.skipped.length > 0 ? (
                <div className="mt-3 space-y-1 text-[color:var(--color-warning)]">
                  {bulkImportSaveResult.skipped.map((item) => (
                    <div key={item.candidate.hostAlias}>{item.candidate.hostAlias}: {skipReasonText(item.skipReasons)}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {importResult.warnings.length > 0 ? (
            <div className="surface border-[color:var(--color-warning)] p-3 text-sm leading-6 text-[color:var(--color-warning)]">
              {importResult.warnings.map((warning) => (
                <div key={warning}>{sanitizeMessage(warning)}</div>
              ))}
            </div>
          ) : null}
          {importResult.candidates.length === 0 ? <div className="text-sm text-[color:var(--color-muted)]">No importable SSH host aliases found.</div> : null}
          {bulkImportCandidateMetadata.map((metadata) => {
            const candidate = metadata.candidate;
            const reasonId = metadata.skipReasons.length > 0 ? `ssh-import-${candidate.hostAlias}-reason` : undefined;

            return (
              <article className="surface p-4" key={candidate.hostAlias}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      aria-describedby={reasonId}
                      aria-label={`Select ${candidate.hostAlias} for bulk import`}
                      checked={metadata.selectable && selectedAliases.has(candidate.hostAlias)}
                      disabled={!metadata.selectable || bulkImportSaveMutation.isPending}
                      onChange={() => toggleImportCandidateSelection(candidate.hostAlias)}
                      type="checkbox"
                    />
                    <div>
                      <div className="font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{candidate.hostAlias}</div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="metric-label">Host alias</dt>
                          <dd className="mt-1 font-semibold text-[color:var(--color-text)]">{candidate.draft.host}</dd>
                        </div>
                        <div>
                          <dt className="metric-label">Resolved HostName</dt>
                          <dd className="mt-1 font-semibold text-[color:var(--color-text)]">{formatUnknown(candidate.hostname)}</dd>
                        </div>
                        <div>
                          <dt className="metric-label">User</dt>
                          <dd className="mt-1 font-semibold text-[color:var(--color-text)]">{formatUnknown(candidate.draft.username)}</dd>
                        </div>
                        <div>
                          <dt className="metric-label">Port</dt>
                          <dd className="mt-1 font-semibold text-[color:var(--color-text)]">{candidate.draft.port}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <Button onClick={() => importCandidate(candidate)} type="button" variant="primary">
                    Use {candidate.hostAlias}
                  </Button>
                </div>
                {metadata.skipReasons.length > 0 ? (
                  <div className="mt-3 text-sm font-semibold leading-6 text-[color:var(--color-warning)]" id={reasonId}>{skipReasonText(metadata.skipReasons)}</div>
                ) : null}
                {candidate.warnings.length > 0 ? (
                  <div className="mt-3 space-y-1 text-sm leading-6 text-[color:var(--color-warning)]">
                    {candidate.warnings.map((warning) => (
                      <div key={warning}>{sanitizeMessage(warning)}</div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};
