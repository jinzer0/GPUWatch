import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
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
    <section className="settings-screen appearance-settings" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="appearance-heading">외형</h2>
      {isLoading ? <p role="status">외형 설정을 불러오는 중…</p> : null}
      <fieldset disabled={disabled} className="appearance-options">
        <legend className="sr-only">외형 선택</legend>
        <RadioList htmlName="appearance" isDisabled={disabled} isLabelHidden label="외형 모드"
          onChange={(mode) => { if (!disabled) void setAppearance(mode as AppearanceMode).catch(() => {}); }}
          size="sm" value={hasLoaded ? appearance.mode : ''} width="100%">
          {modes.map(({ mode, label }) => <RadioListItem
            className="appearance-option"
            key={mode}
            label={label}
            startContent={<span aria-hidden="true" className={`appearance-preview appearance-preview-${mode}`}><span /><span /></span>}
            value={mode}
          />)}
        </RadioList>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
};
