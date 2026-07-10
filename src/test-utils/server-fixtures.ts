import type {
  ConnectionTestResultDto,
  Server,
  ServerInput,
  ServerOverviewDto,
  SshConfigImportResult
} from '../lib/types';

export const overviewRow: ServerOverviewDto = {
  id: 'server-1',
  name: 'Electron GPU',
  host: 'electron.local',
  status: 'online',
  gpuTotal: 1,
  busyGpuCount: 0,
  freeGpuCount: 1,
  averageGpuUtilizationPercent: 5,
  averageMemoryUsagePercent: 10,
  maxTemperatureCelsius: 55,
  lastSuccessAt: '2026-06-06T00:00:00Z',
  lastErrorType: null,
  lastErrorMessage: null
};

export const overviewRows: ServerOverviewDto[] = [
  {
    id: 'alpha',
    name: 'Alpha Node',
    host: 'alpha.local',
    status: 'online',
    gpuTotal: 4,
    busyGpuCount: 2,
    freeGpuCount: 2,
    averageGpuUtilizationPercent: 32.5,
    averageMemoryUsagePercent: 44.1,
    maxTemperatureCelsius: 68,
    lastSuccessAt: '2026-06-01T00:00:00Z',
    lastErrorType: null,
    lastErrorMessage: null
  },
  {
    id: 'beta',
    name: 'Beta Node',
    host: 'beta.local',
    status: 'stale',
    gpuTotal: 2,
    busyGpuCount: 1,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: null,
    averageMemoryUsagePercent: null,
    maxTemperatureCelsius: null,
    lastSuccessAt: '2026-06-01T01:00:00Z',
    lastErrorType: 'ssh_timeout',
    lastErrorMessage: 'SSH connection timed out'
  },
  {
    id: 'gamma',
    name: 'Gamma Node',
    host: 'gamma.local',
    status: 'error',
    gpuTotal: 1,
    busyGpuCount: 0,
    freeGpuCount: 1,
    averageGpuUtilizationPercent: null,
    averageMemoryUsagePercent: null,
    maxTemperatureCelsius: null,
    lastSuccessAt: null,
    lastErrorType: 'auth_failed',
    lastErrorMessage: 'Permission denied for /Users/alice/.ssh/id_ed25519'
  }
];

export const serverInput: ServerInput = {
  id: null,
  name: 'Saved GPU',
  host: 'saved.local',
  port: 22,
  username: 'alice',
  sshKeyPath: null,
  pollingIntervalSeconds: 30,
  enabled: true
};

export const serverFromInput = (input: ServerInput): Server => ({
  id: input.id ?? 'server-1',
  name: input.name,
  host: input.host,
  port: input.port,
  username: input.username,
  sshKeyPath: input.sshKeyPath,
  pollingIntervalSeconds: input.pollingIntervalSeconds ?? 30,
  enabled: input.enabled,
  configRevision: 1,
  createdAt: '2026-06-02T00:00:00Z',
  updatedAt: '2026-06-02T00:00:00Z'
});

export const savedServer: Server = {
  ...serverInput,
  id: 'server-2',
  pollingIntervalSeconds: 30,
  configRevision: 1,
  createdAt: '2026-06-06T00:00:00Z',
  updatedAt: '2026-06-06T00:00:00Z'
};

export const connectionResult: ConnectionTestResultDto = {
  ok: true,
  status: 'online',
  errorType: null,
  message: 'Connection successful.'
};

export const sshConfigImportResult: SshConfigImportResult = {
  candidates: [
    {
      hostAlias: 'gpu-lab',
      hostname: 'gpu01.internal.example',
      draft: {
        id: null,
        name: 'gpu-lab',
        host: 'gpu-lab',
        port: 2202,
        username: 'alice',
        sshKeyPath: '~/.ssh/id_gpuwatcher',
        pollingIntervalSeconds: null,
        enabled: true
      },
      warnings: []
    }
  ],
  warnings: []
};

export const settingsSshConfigImportResult: SshConfigImportResult = {
  candidates: [
    {
      hostAlias: 'gpu-prod',
      hostname: 'gpu01.internal.example',
      draft: {
        id: null,
        name: 'GPU Production',
        host: 'gpu-prod',
        port: 2202,
        username: 'alice',
        sshKeyPath: '~/.ssh/id_gpuwatcher',
        pollingIntervalSeconds: 45,
        enabled: false
      },
      warnings: [
        'Host gpu-prod uses unsupported ProxyJump; import ignores it',
        'Host gpu-prod uses unsupported ProxyCommand; import ignores it',
        'Host gpu-prod ignored identity /Users/alice/.ssh/bastion.pem --token secret-value'
      ]
    }
  ],
  warnings: ['Include file /Users/alice/.ssh/extra.conf was skipped with secret abc123']
};

export const selectedBulkSshConfigImportResult: SshConfigImportResult = {
  candidates: [
    {
      hostAlias: 'gpu-prod-a',
      hostname: 'resolved-a.internal.example',
      draft: {
        id: 'draft-a',
        name: 'GPU Prod A',
        host: 'gpu-prod-a',
        port: 2202,
        username: 'alice',
        sshKeyPath: '~/.ssh/id_gpuwatcher',
        pollingIntervalSeconds: 45,
        enabled: true
      },
      warnings: ['Host gpu-prod-a uses unsupported ProxyJump; import ignores it']
    },
    {
      hostAlias: 'gpu-prod-b',
      hostname: 'resolved-b.internal.example',
      draft: {
        id: 'draft-b',
        name: 'GPU Prod B',
        host: 'gpu-prod-b',
        port: 22,
        username: 'bob',
        sshKeyPath: null,
        pollingIntervalSeconds: null,
        enabled: true
      },
      warnings: []
    },
    {
      hostAlias: 'missing-user',
      hostname: null,
      draft: {
        id: null,
        name: 'Missing User',
        host: 'missing-user',
        port: 22,
        username: '',
        sshKeyPath: null,
        pollingIntervalSeconds: null,
        enabled: true
      },
      warnings: []
    },
    {
      hostAlias: 'saved-duplicate',
      hostname: 'saved.internal.example',
      draft: {
        id: null,
        name: 'Saved Duplicate',
        host: 'saved.local',
        port: 22,
        username: 'alice',
        sshKeyPath: null,
        pollingIntervalSeconds: 30,
        enabled: true
      },
      warnings: []
    }
  ],
  warnings: []
};
