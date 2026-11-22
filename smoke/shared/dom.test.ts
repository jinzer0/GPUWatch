import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cdp.mjs', () => ({
  evaluate: vi.fn(async (_cdp: unknown, expression: string) => window.eval(expression))
}));
vi.mock('./wait.mjs', () => ({
  waitFor: vi.fn(async (_label: string, callback: () => Promise<unknown>) => callback())
}));

import { clickText, waitForEnabledClickableText } from './dom.mjs';

describe('smoke accessible control selection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('skips aria-disabled actions when finding an enabled control', async () => {
    document.body.innerHTML = '<button aria-disabled="true">Save server</button><button>Save server</button>';
    const disabledClick = vi.fn();
    const enabledClick = vi.fn();
    document.querySelectorAll('button')[0].addEventListener('click', disabledClick);
    document.querySelectorAll('button')[1].addEventListener('click', enabledClick);

    await clickText({}, 'Save server');

    expect(disabledClick).not.toHaveBeenCalled();
    expect(enabledClick).toHaveBeenCalledOnce();
  });

  it('reports aria-disabled actions as unavailable to the readiness check', async () => {
    document.body.innerHTML = '<button aria-disabled="true">Save server</button>';

    expect(await waitForEnabledClickableText({}, 'Save server')).toBe(false);
  });

  it('clicks an enabled menu item through its accessible name', async () => {
    document.body.innerHTML = '<div role="menuitem" tabindex="-1" aria-label="서버 편집"><span>Edit</span></div>';
    const click = vi.fn();
    document.querySelector('[role="menuitem"]')!.addEventListener('click', click);

    await clickText({}, '서버 편집');

    expect(click).toHaveBeenCalledOnce();
  });

  it('skips menu items retained inside a closed popover', async () => {
    document.body.innerHTML = '<div role="menuitem">서버 삭제</div><div role="menuitem">서버 삭제</div>';
    const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const hiddenClick = vi.fn();
    const visibleClick = vi.fn();
    items[0].checkVisibility = () => false;
    items[1].checkVisibility = () => true;
    items[0].addEventListener('click', hiddenClick);
    items[1].addEventListener('click', visibleClick);

    await clickText({}, '서버 삭제');

    expect(hiddenClick).not.toHaveBeenCalled();
    expect(visibleClick).toHaveBeenCalledOnce();
  });
});
