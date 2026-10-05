import { create } from 'zustand';

import type { AppearanceMode, AppearanceState, UiResponse } from '../../electron/uiContract';

interface AppearanceStore {
  appearance: AppearanceState;
  error: string | null;
  isSaving: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
}

const browserAppearance: AppearanceState = { mode: 'system', resolved: 'light' };
let appearanceRevision = 0;

export const useAppearanceStore = create<AppearanceStore>(() => ({
  appearance: browserAppearance,
  error: null,
  isSaving: false,
  isLoading: false,
  hasLoaded: false
}));

function applyAppearance(appearance: AppearanceState): void {
  appearanceRevision += 1;
  document.documentElement.dataset.appearance = appearance.resolved;
  useAppearanceStore.setState({ appearance, error: null, isLoading: false, hasLoaded: true });
}

function responseData<T>(response: UiResponse<T>): T {
  if (response.ok) {
    return response.data;
  }
  throw Object.assign(new Error(response.error.message), { type: response.error.type });
}

function unavailable(): Error & { type: string } {
  return Object.assign(new Error('GPUWatcher desktop UI is unavailable. Launch the desktop app to use this action.'), {
    type: 'backend_unavailable'
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function connectAppearance(): () => void {
  const bridge = window.gpuwatcherUi;
  if (!bridge) {
    applyAppearance(browserAppearance);
    return () => {};
  }

  let disposed = false;
  let receivedEvent = false;
  useAppearanceStore.setState({ isLoading: true });
  const unsubscribe = bridge.onAppearanceChanged((appearance) => {
    if (disposed) {
      return;
    }
    receivedEvent = true;
    applyAppearance(appearance);
  });

  void (async () => {
    try {
      const response = await bridge.getAppearance();
      if (!disposed && !receivedEvent) {
        applyAppearance(responseData(response));
      }
    } catch (error) {
      if (!disposed && !receivedEvent) {
        useAppearanceStore.setState({ error: errorMessage(error), isLoading: false });
      }
    }
  })();

  return () => {
    if (!disposed) {
      disposed = true;
      unsubscribe();
    }
  };
}

export async function setAppearance(mode: AppearanceMode): Promise<void> {
  const revision = appearanceRevision;
  useAppearanceStore.setState({ isSaving: true, error: null });
  try {
    const bridge = window.gpuwatcherUi;
    if (!bridge) {
      throw unavailable();
    }
    const appearance = responseData(await bridge.setAppearance(mode));
    if (revision === appearanceRevision) {
      applyAppearance(appearance);
    }
  } catch (error) {
    useAppearanceStore.setState({ error: errorMessage(error) });
    throw error;
  } finally {
    useAppearanceStore.setState({ isSaving: false });
  }
}

export async function openSettings(): Promise<void> {
  try {
    const bridge = window.gpuwatcherUi;
    if (!bridge) {
      throw unavailable();
    }
    responseData(await bridge.openSettings());
    useAppearanceStore.setState({ error: null });
  } catch (error) {
    useAppearanceStore.setState({ error: errorMessage(error) });
    throw error;
  }
}
