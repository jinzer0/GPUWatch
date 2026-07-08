import { useEffect } from 'react';
import type { ReactNode } from 'react';

export const RightDrawer = ({
  ariaLabel,
  children,
  isOpen = true,
  onClose,
  title
}: {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly isOpen?: boolean;
  readonly onClose: () => void;
  readonly title: string;
}) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="right-drawer-backdrop">
      <aside aria-label={ariaLabel} aria-modal="true" className="right-drawer-shell" role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] p-5">
          <div>
            <div className="eyebrow">Details</div>
            <h2 className="mt-2 font-[var(--font-display)] text-3xl font-black leading-none tracking-[-0.08em]">{title}</h2>
          </div>
          <button aria-label="Close drawer" className="btn btn-secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </aside>
    </div>
  );
};
