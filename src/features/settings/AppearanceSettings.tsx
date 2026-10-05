import type { AppearanceMode } from '../../../electron/uiContract';
import { setAppearance, useAppearanceStore } from '../../lib/appearance';

const modes: { mode: AppearanceMode; label: string }[] = [
  { mode: 'system', label: '시스템 설정 따르기' },
  { mode: 'light', label: '라이트' },
  { mode: 'dark', label: '다크' }
];

export const AppearanceSettings = () => {
  const appearance = useAppearanceStore((state) => state.appearance);
  const error = useAppearanceStore((state) => state.error);
  const isSaving = useAppearanceStore((state) => state.isSaving);
  const isLoading = useAppearanceStore((state) => state.isLoading);
  const hasLoaded = useAppearanceStore((state) => state.hasLoaded);
  const disabled = !window.gpuwatcherUi || isSaving || isLoading;

  return (
    <section className="settings-screen space-y-6" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="text-2xl font-semibold">외형</h2>
      {isLoading ? <p role="status">외형 설정을 불러오는 중…</p> : null}
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="sr-only">외형 선택</legend>
        {modes.map(({ mode, label }) => (
          <label key={mode} className="flex items-center gap-3">
            <input
              type="radio"
              name="appearance"
              value={mode}
              checked={hasLoaded && appearance.mode === mode}
              disabled={disabled}
              onChange={() => { void setAppearance(mode).catch(() => {}); }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
};
