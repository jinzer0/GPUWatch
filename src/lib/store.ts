import { create } from 'zustand';

import { appendLiveGpuSamplesFromDetail } from './liveHistory';
import type { LiveGpuSampleMap } from './liveHistory';
import type { ServerDetailDto } from './types';

export type DensityMode = 'full' | 'compact';
export const LAST_SERVER_STORAGE_KEY = 'gpuwatcher:last-server-id';

export interface GpuDisclosure {
  expanded: boolean;
  metricsExpanded: boolean;
}

const restoreSelectedServerId = (): string | null => {
  try {
    return localStorage.getItem(LAST_SERVER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

const persistSelectedServerId = (serverId: string | null): void => {
  try {
    if (serverId === null) {
      localStorage.removeItem(LAST_SERVER_STORAGE_KEY);
    } else {
      localStorage.setItem(LAST_SERVER_STORAGE_KEY, serverId);
    }
  } catch {
    // Selection remains usable when browser storage is unavailable.
  }
};

interface UiState {
  managementOpen: boolean;
  selectedServerId: string | null;
  editingServerId: string | null;
  gpuDisclosures: Record<string, Record<string, GpuDisclosure>>;
  liveSamples: LiveGpuSampleMap;
  densityMode: DensityMode;
  setManagementOpen: (managementOpen: boolean) => void;
  selectServer: (serverId: string | null) => void;
  reconcileServers: (ids: readonly string[]) => void;
  setGpuDisclosure: (serverId: string, gpuKey: string, disclosure: Partial<GpuDisclosure>) => void;
  editServer: (serverId: string | null) => void;
  appendLiveSamplesFromDetail: (detail: ServerDetailDto) => void;
  setDensityMode: (densityMode: DensityMode) => void;
  toggleDensityMode: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  managementOpen: false,
  selectedServerId: restoreSelectedServerId(),
  editingServerId: null,
  gpuDisclosures: {},
  liveSamples: {},
  densityMode: 'full',
  setManagementOpen: (managementOpen) => set({ managementOpen }),
  selectServer: (selectedServerId) => {
    persistSelectedServerId(selectedServerId);
    set({ selectedServerId, managementOpen: false });
  },
  reconcileServers: (ids) => set((state) => {
    const selectedServerId = state.selectedServerId !== null && ids.includes(state.selectedServerId)
      ? state.selectedServerId
      : ids[0] ?? null;
    persistSelectedServerId(selectedServerId);
    const gpuDisclosures = Object.fromEntries(
      Object.entries(state.gpuDisclosures).filter(([serverId]) => ids.includes(serverId))
    );
    return { selectedServerId, gpuDisclosures };
  }),
  setGpuDisclosure: (serverId, gpuKey, disclosure) => set((state) => ({
    gpuDisclosures: {
      ...state.gpuDisclosures,
      [serverId]: {
        ...state.gpuDisclosures[serverId],
        [gpuKey]: {
          ...(state.gpuDisclosures[serverId]?.[gpuKey] ?? { expanded: false, metricsExpanded: false }),
          ...disclosure
        }
      }
    }
  })),
  editServer: (editingServerId) => set({ editingServerId, managementOpen: true }),
  appendLiveSamplesFromDetail: (detail) =>
    set((state) => ({ liveSamples: appendLiveGpuSamplesFromDetail(state.liveSamples, detail) })),
  setDensityMode: (densityMode) => set({ densityMode }),
  toggleDensityMode: () => set((state) => ({ densityMode: state.densityMode === 'compact' ? 'full' : 'compact' }))
}));
