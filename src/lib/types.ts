export type ServerStatus = 'disabled' | 'idle' | 'polling' | 'online' | 'stale' | 'offline' | 'error' | string;

export type TabId = 'overview' | 'detail' | 'processes' | 'settings';

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sshKeyPath: string | null;
  pollingIntervalSeconds: number;
  enabled: boolean;
  configRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServerInput {
  id: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  sshKeyPath: string | null;
  pollingIntervalSeconds: number | null;
  enabled: boolean;
}

export interface ServerHealthDto {
  status: ServerStatus;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
  lastPollStartedAt: string | null;
  lastPollFinishedAt: string | null;
  lastSuccessAt: string | null;
}

export interface ServerOverviewDto {
  id: string;
  name: string;
  host: string;
  status: ServerStatus;
  gpuTotal: number;
  busyGpuCount: number;
  freeGpuCount: number;
  averageGpuUtilizationPercent: number | null;
  averageMemoryUsagePercent: number | null;
  maxTemperatureCelsius: number | null;
  lastSuccessAt: string | null;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
}

export interface CollectorProcess {
  pid: number;
  parentPid?: number | null;
  runtimeSeconds?: number | null;
  username: string | null;
  command: string | null;
  gpuMemoryUsedMiB: number | null;
  gpuUtilizationPercent: number | null;
  gpuSmUtilizationPercent?: number | null;
  gpuMemoryUtilizationPercent?: number | null;
  gpuEncoderUtilizationPercent?: number | null;
  gpuDecoderUtilizationPercent?: number | null;
  cpuPercent: number | null;
  hostMemoryUsedMiB: number | null;
}

export interface GpuCardDto {
  index: number;
  uuid: string;
  name: string;
  pciBusId: string | null;
  driverVersion: string | null;
  graphicsClockMhz: number | null;
  memoryClockMhz: number | null;
  busy: boolean;
  memoryTotalMiB: number | null;
  memoryUsedMiB: number | null;
  memoryFreeMiB: number | null;
  gpuUtilizationPercent: number | null;
  memoryUtilizationPercent: number | null;
  encoderUtilizationPercent?: number | null;
  decoderUtilizationPercent?: number | null;
  jpegUtilizationPercent?: number | null;
  ofaUtilizationPercent?: number | null;
  pcieRxKibPerSec?: number | null;
  pcieTxKibPerSec?: number | null;
  pcieLinkGenCurrent?: number | null;
  pcieLinkWidthCurrent?: number | null;
  migModeCurrent?: string | null;
  migModePending?: string | null;
  migInstanceCount?: number | null;
  temperatureCelsius: number | null;
  powerDrawWatt: number | null;
  powerLimitWatt: number | null;
  fanSpeedPercent: number | null;
  processCount: number;
  processes: CollectorProcess[];
}

export interface ServerDetailDto {
  server: Server;
  health: ServerHealthDto;
  collectorHostname: string | null;
  driverVersion: string | null;
  cudaVersion: string | null;
  receivedAt: string | null;
  warnings: string[];
  gpus: GpuCardDto[];
}

export interface ProcessRowDto {
  serverId: string;
  serverName: string;
  stale: boolean;
  gpuIndex: number;
  pid: number;
  parentPid?: number | null;
  runtimeSeconds?: number | null;
  username: string | null;
  command: string | null;
  gpuUuid: string;
  processKind: string;
  gpuMemoryUsedMiB: number | null;
  gpuUtilizationPercent: number | null;
  gpuSmUtilizationPercent?: number | null;
  gpuMemoryUtilizationPercent?: number | null;
  gpuEncoderUtilizationPercent?: number | null;
  gpuDecoderUtilizationPercent?: number | null;
  cpuPercent: number | null;
  hostMemoryUsedMiB: number | null;
}

export interface ConnectionTestResultDto {
  ok: boolean;
  status: ServerStatus;
  errorType: string | null;
  message: string | null;
}
