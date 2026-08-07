import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { Button } from './Button';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const drawerFocusableElements = (drawer: HTMLElement) =>
  Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getAttribute('aria-disabled') !== 'true');

const drawerCloseButton = (drawer: HTMLElement | null) => drawer?.querySelector<HTMLButtonElement>('button[aria-label="Close drawer"]') ?? null;

export const RightDrawer = ({
  ariaLabel,
  autoFocusCloseButton = true,
  children,
  isOpen = true,
  onClose,
  title
}: {
  readonly ariaLabel: string;
  readonly autoFocusCloseButton?: boolean;
  readonly children: ReactNode;
  readonly isOpen?: boolean;
  readonly onClose: () => void;
  readonly title: string;
}) => {
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (autoFocusCloseButton) {
      drawerCloseButton(drawerRef.current)?.focus();
    } else {
      drawerRef.current?.focus();
    }

    const eventStartedInsideDrawer = (event: Event) => {
      const drawer = drawerRef.current;
      const target = event.target;
      return drawer !== null && target instanceof Node && drawer.contains(target);
    };

    const blockOutsideEvent = (event: Event) => {
      if (eventStartedInsideDrawer(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (eventStartedInsideDrawer(event)) {
        return;
      }
      drawerCloseButton(drawerRef.current)?.focus();
      blockOutsideEvent(event);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      const drawer = drawerRef.current;
      if (drawer === null) {
        return;
      }

      const activeElement = document.activeElement;
      const keyboardFocusIsInsideDrawer = activeElement instanceof Node && drawer.contains(activeElement);
      if (!eventStartedInsideDrawer(event) && !keyboardFocusIsInsideDrawer) {
        blockOutsideEvent(event);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = drawerFocusableElements(drawer);
      const firstElement = focusableElements[0] ?? drawer;
      const lastElement = focusableElements.at(-1) ?? drawer;

      if (!(activeElement instanceof HTMLElement) || !drawer.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('click', blockOutsideEvent, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', blockOutsideEvent, true);
    document.addEventListener('touchstart', blockOutsideEvent, true);

    return () => {
      document.removeEventListener('click', blockOutsideEvent, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', blockOutsideEvent, true);
      document.removeEventListener('touchstart', blockOutsideEvent, true);
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [autoFocusCloseButton, isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="right-drawer-backdrop">
      <aside aria-label={ariaLabel} aria-modal="true" className="right-drawer-shell outline-none" ref={drawerRef} role="dialog" tabIndex={-1}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] bg-[var(--color-panel-strong)] p-5">
          <div>
            <div className="eyebrow">Details</div>
            <h2 className="mt-2 font-[var(--font-display)] text-3xl font-black leading-none tracking-[-0.08em]">{title}</h2>
          </div>
          <Button aria-label="Close drawer" onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </aside>
    </div>
  );
};
