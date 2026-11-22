import '@testing-library/react';

if (typeof document !== 'undefined' && !globalThis.CSS?.escape) {
  const escape = (value: string) => Array.from(value, char => `\\${char.codePointAt(0)?.toString(16)} `).join('');
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { ...globalThis.CSS, escape } });
}

// jsdom models the dialog element, but doesn't implement its open/close methods.
// Actual modal stacking and browser keyboard behavior are covered by Electron smoke.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (returnValue) {
    if (!this.open) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
