import { ResultFeedback } from '../../components/ui';
import { formatUnknown, sanitizeMessage } from '../../lib/format';
import type { SshConfigImportCandidate, SshConfigImportResult } from '../../lib/types';

type SettingsImportPanelProps = {
  readonly importCandidate: (candidate: SshConfigImportCandidate) => void;
  readonly importResult: SshConfigImportResult | undefined;
  readonly isPending: boolean;
  readonly mutate: () => void;
  readonly error: Error | null;
};

export const SettingsImportPanel = ({ error, importCandidate, importResult, isPending, mutate }: SettingsImportPanelProps) => (
  <section aria-labelledby="ssh-config-import-heading" className="surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="metric-label" id="ssh-config-import-heading">SSH config import</div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted)]">Preview default OpenSSH host aliases, then copy one candidate into the manual server form.</p>
      </div>
      <button className="btn btn-secondary" disabled={isPending} onClick={mutate} type="button">
        Import from SSH config
      </button>
    </div>

    {isPending ? (
      <div className="mt-4">
        <ResultFeedback label="SSH config import" state="pending" />
      </div>
    ) : null}
    {error ? (
      <div className="mt-4">
        <ResultFeedback label="SSH config import result" message={error.message} state="error" />
      </div>
    ) : null}
    {importResult ? (
      <div className="mt-4 space-y-3" aria-live="polite">
        <div className="section-title text-2xl">SSH config import candidates</div>
        {importResult.warnings.length > 0 ? (
          <div className="surface border-[color:var(--color-warning)] p-3 text-sm leading-6 text-[color:var(--color-warning)]">
            {importResult.warnings.map((warning) => (
              <div key={warning}>{sanitizeMessage(warning)}</div>
            ))}
          </div>
        ) : null}
        {importResult.candidates.length === 0 ? <div className="text-sm text-[color:var(--color-muted)]">No importable SSH host aliases found.</div> : null}
        {importResult.candidates.map((candidate) => (
          <article className="surface p-4" key={candidate.hostAlias}>
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                    <dd className="mt-1 font-semibold text-[color:var(--color-text)]">{candidate.draft.username}</dd>
                  </div>
                  <div>
                    <dt className="metric-label">Port</dt>
                    <dd className="mt-1 font-semibold text-[color:var(--color-text)]">{candidate.draft.port}</dd>
                  </div>
                </dl>
              </div>
              <button className="btn btn-primary" onClick={() => importCandidate(candidate)} type="button">
                Use {candidate.hostAlias}
              </button>
            </div>
            {candidate.warnings.length > 0 ? (
              <div className="mt-3 space-y-1 text-sm leading-6 text-[color:var(--color-warning)]">
                {candidate.warnings.map((warning) => (
                  <div key={warning}>{sanitizeMessage(warning)}</div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    ) : null}
  </section>
);
