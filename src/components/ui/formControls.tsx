import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

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

export const LabeledTextInput = ({ helperText, id, label, ...inputProps }: LabeledTextInputProps) => {
  const helperId = helperText ? `${id}-hint` : undefined;

  return (
    <label className="min-w-44 text-sm" htmlFor={id}>
      <span className="metric-label">{label}</span>
      <input {...inputProps} aria-describedby={helperId} className="input mt-2" id={id} type="text" />
      {helperText ? (
        <span className="mt-1 block text-xs text-[color:var(--color-muted)]" id={helperId}>
          {helperText}
        </span>
      ) : null}
    </label>
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

export const LabeledSelect = ({ helperText, id, label, options, ...selectProps }: LabeledSelectProps) => {
  const helperId = helperText ? `${id}-hint` : undefined;

  return (
    <label className="min-w-44 text-sm" htmlFor={id}>
      <span className="metric-label">{label}</span>
      <select {...selectProps} aria-describedby={helperId} className="input mt-2" id={id}>
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
    </label>
  );
};

type ResetButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label?: string;
};

export const ResetButton = ({ className = '', label = 'Reset filters', type = 'button', ...buttonProps }: ResetButtonProps) => (
  <button {...buttonProps} className={`btn btn-secondary ${className}`.trim()} type={type}>
    {label}
  </button>
);
