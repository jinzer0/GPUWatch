import type { ButtonHTMLAttributes } from 'react';

const buttonVariantClasses = {
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  primary: 'btn-primary',
  secondary: 'btn-secondary'
} as const;

const buttonSizeClasses = {
  md: 'btn-md',
  sm: 'btn-sm'
} as const;

export type ButtonVariant = keyof typeof buttonVariantClasses;
export type ButtonSize = keyof typeof buttonSizeClasses;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
};

const joinButtonClasses = (className: string | undefined, size: ButtonSize, variant: ButtonVariant) =>
  ['btn', buttonVariantClasses[variant], buttonSizeClasses[size], className]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');

export const Button = ({ className, size = 'md', type = 'button', variant = 'secondary', ...buttonProps }: ButtonProps) => (
  <button {...buttonProps} className={joinButtonClasses(className, size, variant)} type={type} />
);
