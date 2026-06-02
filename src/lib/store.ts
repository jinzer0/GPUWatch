import { create } from 'zustand';

import type { TabId } from './types';

export type AppScreen = TabId;

interface UiState {
  activeScreen: AppScreen;
  activeTab: TabId;
  selectedServerId: string | null;
  editingServerId: string | null;
  setActiveScreen: (screen: AppScreen) => void;
  setActiveTab: (tab: TabId) => void;
  selectServer: (serverId: string | null) => void;
  editServer: (serverId: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeScreen: 'overview',
  activeTab: 'overview',
  selectedServerId: null,
  editingServerId: null,
  setActiveScreen: (activeScreen) => set({ activeScreen, activeTab: activeScreen }),
  setActiveTab: (activeTab) => set({ activeTab, activeScreen: activeTab }),
  selectServer: (selectedServerId) => set({ selectedServerId }),
  editServer: (editingServerId) => set({ editingServerId })
}));
