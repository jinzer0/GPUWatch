import { Children, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Button as AstryxButton } from '@astryxdesign/core/Button';
import { IconButton as AstryxIconButton } from '@astryxdesign/core/IconButton';

const astryxVariants = {
  danger: 'destructive',
  ghost: 'ghost',
  primary: 'primary',
  secondary: 'secondary'
} as const;

export type ButtonVariant = keyof typeof astryxVariants;
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon?: ReactNode;
  readonly loading?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
};

const joinButtonClasses = (className: string | undefined, size: ButtonSize, variant: ButtonVariant) =>
  ['btn', `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(' ');

export const Button = ({
  children, className, disabled, loading, size = 'md', type = 'button', variant = 'secondary', ...props
}: ButtonProps) => {
  const label = props['aria-label'] ?? Children.toArray(children)
    .filter(value => typeof value === 'string' || typeof value === 'number')
    .join('');
  return (
    <AstryxButton
      {...props}
      {...{ disabled }}
      className={joinButtonClasses(className, size, variant)}
      isDisabled={disabled && !loading}
      isLoading={loading}
      label={label}
      size={size}
      type={type}
      variant={astryxVariants[variant]}
    >
      {children}
    </AstryxButton>
  );
};

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  readonly icon: ReactNode;
  readonly label: string;
};

export const IconButton = ({
  className, disabled, loading, size = 'md', type = 'button', variant = 'ghost', ...props
}: IconButtonProps) => (
  <AstryxIconButton
    {...props}
    {...{ disabled }}
    className={joinButtonClasses(className, size, variant)}
    isDisabled={disabled && !loading}
    isLoading={loading}
    size={size}
    type={type}
    variant={astryxVariants[variant]}
  />
);
