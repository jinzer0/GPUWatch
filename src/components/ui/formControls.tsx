import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

import { Button } from './Button';

export const InlineToolbar = ({ children, label, summary }: { readonly children: ReactNode; readonly label?: string; readonly summary?: ReactNode }) => (
  <div className="surface flex flex-wrap items-end justify-between gap-3 p-4">
    {label || summary ? (
      <div className="min-w-48 flex-1">
        {label ? <div className="eyebrow">{label}</div> : null}
        {summary ? <p className="mt-1 text-sm text-[color:var(--color-muted)]">{summary}</p> : null}
      </div>
    ) : null}
    <div className="flex flex-1 flex-wrap items-end justify-end gap-3">{children}</div>
  </div>
);

type LabeledTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  readonly helperText?: ReactNode;
  readonly id: string;
  readonly label: string;
};

const joinDescriptionIds = (externalId: string | undefined, helperId: string | undefined) =>
  [externalId, helperId]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ') || undefined;

export const LabeledTextInput = ({ 'aria-describedby': ariaDescribedBy, disabled, helperText, id, label, onChange, ...inputProps }: LabeledTextInputProps) => {
  const helperId = helperText ? `${id}-hint` : undefined;
  const describedBy = joinDescriptionIds(ariaDescribedBy, helperId);
  const changeHandler = disabled ? undefined : onChange;

  return (
    <div className="min-w-44 text-sm">
      <label className="metric-label block" htmlFor={id}>
        {label}
      </label>
      <input {...inputProps} aria-describedby={describedBy} className="input mt-2" disabled={disabled} id={id} onChange={changeHandler} type="text" />
      {helperText ? (
        <span className="mt-1 block text-xs text-[color:var(--color-muted)]" id={helperId}>
          {helperText}
        </span>
      ) : null}
    </div>
  );
};

export interface LabeledSelectOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
}

type LabeledSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  readonly helperText?: ReactNode;
  readonly id: string;
  readonly label: string;
  readonly options: readonly LabeledSelectOption[];
};

export const LabeledSelect = ({ 'aria-describedby': ariaDescribedBy, disabled, helperText, id, label, onChange, options, ...selectProps }: LabeledSelectProps) => {
  const helperId = helperText ? `${id}-hint` : undefined;
  const describedBy = joinDescriptionIds(ariaDescribedBy, helperId);
  const changeHandler = disabled ? undefined : onChange;

  return (
    <div className="min-w-44 text-sm">
      <label className="metric-label block" htmlFor={id}>
        {label}
      </label>
      <select {...selectProps} aria-describedby={describedBy} className="input mt-2" disabled={disabled} id={id} onChange={changeHandler}>
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText ? (
        <span className="mt-1 block text-xs text-[color:var(--color-muted)]" id={helperId}>
          {helperText}
        </span>
      ) : null}
    </div>
  );
};

type ResetButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label?: string;
};

export const ResetButton = ({ label = 'Reset filters', ...buttonProps }: ResetButtonProps) => (
  <Button {...buttonProps} variant="secondary">
    {label}
  </Button>
);
