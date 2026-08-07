import { Button, EmptyState, ErrorState, StatusBadge } from '../../components/ui';
import { formatTime, sanitizeMessage } from '../../lib/format';
import type { Server } from '../../lib/types';
import type { useSettingsController } from './useSettingsController';

type ConfiguredServersPanelProps = Pick<
  ReturnType<typeof useSettingsController>,
  'editServer' | 'enableOperations' | 'enableServer' | 'saveTargetId' | 'selectedServerId'
> & {
  readonly servers: readonly Server[] | undefined;
};

export const ConfiguredServersPanel = ({ editServer, enableOperations, enableServer, saveTargetId, selectedServerId, servers }: ConfiguredServersPanelProps) => (
  <aside aria-label="Configured servers" className="settings-registry-pane panel p-5">
    <div className="settings-registry-pane-copy">
      <div className="section-title">Configured servers</div>
      <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted)]">Select a saved SSH target to edit details, or pause monitoring without changing the remote host.</p>
    </div>
    <div className="settings-registry-list mt-4 space-y-3">
      {servers && servers.length === 0 ? <EmptyState title="No servers" body="Create a server target to begin polling GPU snapshots." /> : null}
      {servers?.map((server) => {
        const enableOperation = enableOperations[server.id];
        const isSelected = selectedServerId === server.id;
        const toggleLabel = server.enabled ? 'Disable monitoring' : 'Enable monitoring';

        return <article aria-label={`${server.name} registry row`} className={`settings-registry-row surface surface-interactive p-4 ${isSelected ? 'border-[color:var(--color-brand)] shadow-[var(--shadow-glow)]' : ''}`.trim()} key={server.id}>
          <div className="settings-registry-row-main flex items-start gap-3">
            <button
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`Select ${server.name}`}
              className="settings-registry-row-select grid min-w-0 flex-1 gap-3 rounded-[var(--radius-control)] border border-transparent bg-transparent p-0 text-left text-[color:var(--color-text)]"
              onClick={() => editServer(server.id)}
              type="button"
            >
              <span className="flex flex-wrap items-start justify-between gap-3">
                <span className="settings-registry-row-identity min-w-0">
                  <span className="settings-registry-row-name block break-words font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{server.name}</span>
                  <span className="settings-registry-row-host mt-1 block break-words text-sm text-[color:var(--color-muted)]">{server.username}@{server.host}:{server.port}</span>
                </span>
                <StatusBadge status={server.enabled ? 'enabled' : 'disabled'} />
              </span>
              <span className="settings-registry-row-meta grid gap-2 text-xs text-[color:var(--color-muted)]">
                <span>Updated {formatTime(server.updatedAt)}</span>
                {isSelected ? <span className="metric-label text-[color:var(--color-brand)]">Selected server</span> : null}
              </span>
            </button>
            <Button
              aria-label={`${toggleLabel} for ${server.name}`}
              disabled={enableOperation?.isPending || saveTargetId === server.id}
              onClick={() => enableServer({ id: server.id, enabled: !server.enabled })}
              type="button"
              className="settings-registry-row-action"
              variant="secondary"
            >
              {toggleLabel}
            </Button>
          </div>
          {enableOperation?.error ? <div className="settings-registry-row-feedback mt-3"><ErrorState message={sanitizeMessage(enableOperation.error.message)} /></div> : null}
        </article>
      })}
    </div>
  </aside>
);
