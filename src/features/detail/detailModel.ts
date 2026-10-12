import type { GpuCardDto, ServerDetailDto } from '../../lib/types';
import { formatUnknown } from '../../lib/format';

export const formatClockMhz = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `${value.toLocaleString()} MHz`;
};

export const formatPcieGeneration = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `Gen ${value}`;
};

export const formatPcieWidth = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `x${value}`;
};

export const formatMigInstanceCount = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `${value.toLocaleString()} ${value === 1 ? 'instance' : 'instances'}`;
};

export const migModeLabel = (value: string | null | undefined) => formatUnknown(value);

export const migBadgeLabel = (gpu: GpuCardDto) => {
  const currentMode = gpu.migModeCurrent?.toLowerCase();
  if (currentMode === 'enabled') {
    return 'MIG enabled';
  }
  if (currentMode === 'disabled') {
    return 'MIG disabled';
  }
  return 'MIG unknown';
};

export const migAvailabilityCopy = (gpu: GpuCardDto) => {
  if (gpu.migModeCurrent === null || gpu.migModeCurrent === undefined) {
    return 'MIG availability is unknown for this GPU.';
  }
  return 'Instance-level MIG topology is not collected yet.';
};

export const shouldShowLastSuccessNote = (detail: ServerDetailDto) => {
  const status = detail.health.status.toLowerCase();
  return status.includes('stale') || status.includes('offline') || status.includes('error') || status.includes('failed');
};
