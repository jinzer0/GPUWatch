// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { rendererHelperContract } from './helperContract.js';
import { UI_CHANNELS, type AppearanceState, type UiBridge } from './uiContract.js';

function loadPreload(file: string) {
  const exposed = new Map<string, unknown>();
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const invoke = vi.fn(async () => ({ ok: true, data: undefined }));
  const removeListener = vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    if (listeners.get(channel) === listener) listeners.delete(channel);
  });
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, value: unknown) => exposed.set(name, value) },
    ipcRenderer: {
      invoke,
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => listeners.set(channel, listener)),
      removeListener
    }
  };
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, {
    exports: {}, process: { platform: 'darwin', versions: { electron: 'test', chrome: 'test' } },
    require: (id: string) => {
      if (id === 'electron') return electron;
      if (id === './helperContract.js') return { rendererHelperContract };
      if (id === './ipc.js') return { channelForPreloadMethod: (method: string) => `gpuwatcher:helper:${method}` };
      if (id === './uiContract.js') return { UI_CHANNELS };
      throw new Error(`Unexpected preload dependency: ${id}`);
    }
  });
  return { exposed, invoke, listeners, removeListener, ui: exposed.get('gpuwatcherUi') as UiBridge };
}

describe.each(['./preload.ts', './preload-runtime.cts'])('%s local UI bridge', (file) => {
  it('exposes only named local UI methods and keeps helper channels separate', async () => {
    const bridge = loadPreload(file);
    expect(Object.keys(bridge.ui).sort()).toEqual(['getAppearance', 'onAppearanceChanged', 'openSettings', 'setAppearance']);
    await bridge.ui.openSettings();
    await bridge.ui.getAppearance();
    await bridge.ui.setAppearance('dark');
    expect(bridge.invoke.mock.calls).toEqual([
      [UI_CHANNELS.openSettings], [UI_CHANNELS.getAppearance], [UI_CHANNELS.setAppearance, 'dark']
    ]);
    expect(Object.keys(bridge.exposed.get('gpuwatcher') as object).sort()).toEqual(rendererHelperContract.map((entry) => entry.electronPreloadMethod).sort());
    for (const api of [bridge.ui, bridge.exposed.get('gpuwatcher') as object]) {
      for (const forbidden of ['invoke', 'runAction', 'helperPath', 'pollDueServers']) expect(forbidden in api).toBe(false);
    }
  });

  it('forwards appearance values without IPC event objects and removes the exact listener', () => {
    const bridge = loadPreload(file);
    const listener = vi.fn();
    const unsubscribe = bridge.ui.onAppearanceChanged(listener);
    const handler = bridge.listeners.get(UI_CHANNELS.appearanceChanged)!;
    const state: AppearanceState = { mode: 'system', resolved: 'dark' };
    handler({ sender: 'private IPC event' }, state);
    expect(listener).toHaveBeenCalledExactlyOnceWith(state);
    unsubscribe();
    expect(bridge.removeListener).toHaveBeenCalledWith(UI_CHANNELS.appearanceChanged, handler);
    expect(bridge.listeners.has(UI_CHANNELS.appearanceChanged)).toBe(false);
  });
});
