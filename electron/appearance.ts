import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { AppearanceMode, AppearanceState } from './uiContract.js';

export interface AppearanceNativeTheme {
  themeSource: AppearanceMode;
  readonly shouldUseDarkColors: boolean;
  on(event: 'updated', listener: () => void): unknown;
  removeListener(event: 'updated', listener: () => void): unknown;
}

export interface AppearanceController {
  initialize(): Promise<void>;
  getAppearance(): AppearanceState;
  setAppearance(mode: AppearanceMode): Promise<AppearanceState>;
  subscribe(listener: (state: AppearanceState) => void): () => void;
  dispose(): void;
}

function isAppearanceMode(mode: unknown): mode is AppearanceMode {
  return mode === 'system' || mode === 'light' || mode === 'dark';
}

function parseMode(content: string): AppearanceMode {
  const value: unknown = JSON.parse(content);
  if (
    typeof value !== 'object' || value === null || Array.isArray(value) ||
    Object.keys(value).length !== 1 || !('mode' in value) || !isAppearanceMode(value.mode)
  ) {
    throw new Error('Invalid persisted appearance: expected only a valid mode.');
  }
  return value.mode;
}

export function createAppearanceController(options: {
  nativeTheme: AppearanceNativeTheme;
  filePath: string;
}): AppearanceController {
  const { nativeTheme, filePath } = options;
  const listeners = new Set<(state: AppearanceState) => void>();
  let state: AppearanceState = { mode: 'system', resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' };
  let initialized = false;
  let disposed = false;
  let applying = false;
  let queue = Promise.resolve();

  function assertActive() {
    if (disposed) throw new Error('Appearance controller is disposed.');
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  function snapshot(): AppearanceState {
    return { ...state };
  }

  function publish(next: AppearanceState) {
    const changed = next.mode !== state.mode || next.resolved !== state.resolved;
    state = next;
    if (changed) {
      for (const listener of listeners) listener(snapshot());
    }
  }

  function apply(mode: AppearanceMode) {
    applying = true;
    try {
      nativeTheme.themeSource = mode;
    } finally {
      applying = false;
    }
    publish({ mode, resolved: mode === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : mode });
  }

  function onUpdated() {
    if (disposed || applying || !initialized || state.mode !== 'system') return;
    publish({ mode: 'system', resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' });
  }

  async function initialize() {
    assertActive();
    if (initialized) return;
    let mode: AppearanceMode;
    try {
      mode = parseMode(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        mode = 'system';
      } else {
        throw error;
      }
    }
    assertActive();
    apply(mode);
    initialized = true;
    nativeTheme.on('updated', onUpdated);
  }

  async function persist(mode: AppearanceMode) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify({ mode })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  return {
    initialize: () => enqueue(initialize),
    getAppearance: snapshot,
    setAppearance: mode => enqueue(async () => {
      assertActive();
      if (!isAppearanceMode(mode)) throw new Error('Invalid appearance mode.');
      await persist(mode);
      assertActive();
      if (!initialized) {
        initialized = true;
        nativeTheme.on('updated', onUpdated);
      }
      apply(mode);
      return snapshot();
    }),
    subscribe(listener) {
      assertActive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      nativeTheme.removeListener('updated', onUpdated);
      listeners.clear();
    }
  };
}
