export type AppearanceMode = 'system' | 'light' | 'dark';

export interface AppearanceState {
  mode: AppearanceMode;
  resolved: 'light' | 'dark';
}

export type UiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { type: string; message: string } };

export interface UiBridge {
  openSettings(): Promise<UiResponse<void>>;
  getAppearance(): Promise<UiResponse<AppearanceState>>;
  setAppearance(mode: AppearanceMode): Promise<UiResponse<AppearanceState>>;
  onAppearanceChanged(listener: (state: AppearanceState) => void): () => void;
}

export const UI_CHANNELS = {
  openSettings: 'gpuwatcher:ui:openSettings',
  getAppearance: 'gpuwatcher:ui:getAppearance',
  setAppearance: 'gpuwatcher:ui:setAppearance',
  appearanceChanged: 'gpuwatcher:ui:appearanceChanged'
} as const;
