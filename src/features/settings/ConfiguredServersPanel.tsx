import { EmptyState, StatusBadge } from '../../components/ui';
import { formatTime } from '../../lib/format';
import type { Server } from '../../lib/types';
import type { useSettingsController } from './useSettingsController';

type ConfiguredServersPanelProps = Pick<ReturnType<typeof useSettingsController>, 'editServer' | 'enabledMutation'> & {
  readonly servers: readonly Server[] | undefined;
};

export const ConfiguredServersPanel = ({ editServer, enabledMutation, servers }: ConfiguredServersPanelProps) => (
  <aside className="panel p-5">
    <div className="section-title">Configured servers</div>
    <div className="mt-4 space-y-3">
      {servers && servers.length === 0 ? <EmptyState title="No servers" body="Create a server target to begin polling GPU snapshots." /> : null}
      {servers?.map((server) => (
        <div className="surface p-4" key={server.id}>
          <div className="flex items-start justify-between gap-3">
            <button className="text-left" onClick={() => editServer(server.id)} type="button">
              <div className="font-semibold">{server.name}</div>
              <div className="text-sm text-[color:var(--color-muted)]">{server.username}@{server.host}:{server.port}</div>
            </button>
            <StatusBadge status={server.enabled ? 'enabled' : 'disabled'} />
          </div>
          <div className="mt-3 text-xs text-[color:var(--color-muted)]">Updated {formatTime(server.updatedAt)}</div>
          <button className="btn btn-secondary mt-3 w-full" disabled={enabledMutation.isPending} onClick={() => enabledMutation.mutate({ id: server.id, enabled: !server.enabled })} type="button">
            {server.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      ))}
    </div>
  </aside>
);
