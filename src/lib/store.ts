import { create } from 'zustand';

import { appendLiveGpuSamplesFromDetail } from './liveHistory';
import type { LiveGpuSampleMap } from './liveHistory';
import type { ServerDetailDto, TabId } from './types';

export type AppScreen = TabId;
export type DensityMode = 'full' | 'compact';

interface UiState {
  activeScreen: AppScreen;
  activeTab: TabId;
  selectedServerId: string | null;
  editingServerId: string | null;
  liveSamples: LiveGpuSampleMap;
  densityMode: DensityMode;
  setActiveScreen: (screen: AppScreen) => void;
  setActiveTab: (tab: TabId) => void;
  selectServer: (serverId: string | null) => void;
  editServer: (serverId: string | null) => void;
  appendLiveSamplesFromDetail: (detail: ServerDetailDto) => void;
  setDensityMode: (densityMode: DensityMode) => void;
  toggleDensityMode: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeScreen: 'overview',
  activeTab: 'overview',
  selectedServerId: null,
  editingServerId: null,
  liveSamples: {},
  densityMode: 'full',
  setActiveScreen: (activeScreen) => set({ activeScreen, activeTab: activeScreen }),
  setActiveTab: (activeTab) => set({ activeTab, activeScreen: activeTab }),
  selectServer: (selectedServerId) => set({ selectedServerId }),
  editServer: (editingServerId) => set({ editingServerId }),
  appendLiveSamplesFromDetail: (detail) =>
    set((state) => ({ liveSamples: appendLiveGpuSamplesFromDetail(state.liveSamples, detail) })),
  setDensityMode: (densityMode) => set({ densityMode }),
  toggleDensityMode: () => set((state) => ({ densityMode: state.densityMode === 'compact' ? 'full' : 'compact' }))
}));
