// @vitest-environment node
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppearanceController, type AppearanceController, type AppearanceNativeTheme } from './appearance.js';
import type { AppearanceMode } from './uiContract.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, readFile: vi.fn(actual.readFile), writeFile: vi.fn(actual.writeFile) };
});

class NativeTheme extends EventEmitter implements AppearanceNativeTheme {
  private source: AppearanceMode = 'system';
  systemDark = false;

  get themeSource(): AppearanceMode {
    return this.source;
  }

  set themeSource(mode: AppearanceMode) {
    this.source = mode;
    this.emit('updated');
  }

  get shouldUseDarkColors() {
    return this.themeSource === 'dark' || (this.themeSource === 'system' && this.systemDark);
  }

  update(dark: boolean) {
    this.systemDark = dark;
    this.emit('updated');
  }
}

describe('persisted appearance controller', () => {
  let directory: string;
  let filePath: string;
  let nativeTheme: NativeTheme;
  let controller: AppearanceController;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gpuwatcher-appearance-'));
    filePath = join(directory, 'appearance.json');
    nativeTheme = new NativeTheme();
    controller = createAppearanceController({ nativeTheme, filePath });
  });

  afterEach(async () => {
    controller.dispose();
    vi.mocked(readFile).mockClear();
    vi.mocked(writeFile).mockClear();
    await rm(directory, { recursive: true, force: true });
  });

  it('uses the current system appearance when the file is absent without creating a file', async () => {
    nativeTheme.systemDark = true;
    await controller.initialize();
    expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'dark' });
    expect(await readdir(directory)).toEqual([]);
  });

  it('loads a persisted explicit mode and initializes only one native listener', async () => {
    await writeFile(filePath, JSON.stringify({ mode: 'dark' }));
    await Promise.all([controller.initialize(), controller.initialize()]);
    expect(controller.getAppearance()).toEqual({ mode: 'dark', resolved: 'dark' });
    expect(nativeTheme.themeSource).toBe('dark');
    expect(nativeTheme.listenerCount('updated')).toBe(1);
  });

  it.each(['{', 'null', '[]', '{}', '{"mode":"blue"}', '{"mode":"light","resolved":"dark"}']) (
    'rejects malformed persisted appearance %s instead of defaulting', async content => {
      await writeFile(filePath, content);
      await expect(controller.initialize()).rejects.toThrow();
      expect(nativeTheme.listenerCount('updated')).toBe(0);
      expect(nativeTheme.themeSource).toBe('system');
    }
  );

  it('rejects non-ENOENT read errors and allows a subsequent initialization retry', async () => {
    const error = Object.assign(new Error('Access denied'), { code: 'EACCES' });
    vi.mocked(readFile).mockRejectedValueOnce(error);
    await expect(controller.initialize()).rejects.toBe(error);
    expect(nativeTheme.listenerCount('updated')).toBe(0);
    await controller.initialize();
    expect(nativeTheme.listenerCount('updated')).toBe(1);
  });

  it('repairs unreadable stored configuration only after an explicit mode selection', async () => {
    await writeFile(filePath, '{');
    await expect(controller.initialize()).rejects.toThrow();
    expect(await readFile(filePath, 'utf8')).toBe('{');
    await expect(controller.setAppearance('dark')).resolves.toEqual({ mode: 'dark', resolved: 'dark' });
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ mode: 'dark' });
    await controller.initialize();
    expect(nativeTheme.listenerCount('updated')).toBe(1);
  });

  it('atomically persists only mode before applying and broadcasting it', async () => {
    await controller.initialize();
    const listener = vi.fn();
    controller.subscribe(listener);
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (...args: Parameters<typeof writeFile>) => {
      expect(nativeTheme.themeSource).toBe('system');
      expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'light' });
      expect(listener).not.toHaveBeenCalled();
      await actual.writeFile(...args);
    });
    await expect(controller.setAppearance('dark')).resolves.toEqual({ mode: 'dark', resolved: 'dark' });
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ mode: 'dark' });
    expect(await readdir(directory)).toEqual(['appearance.json']);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ mode: 'dark', resolved: 'dark' });
  });

  it('rejects writes without applying or broadcasting failed state', async () => {
    await controller.setAppearance('light');
    const listener = vi.fn();
    controller.subscribe(listener);
    const error = Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    vi.mocked(writeFile).mockRejectedValueOnce(error);
    await expect(controller.setAppearance('dark')).rejects.toBe(error);
    expect(controller.getAppearance()).toEqual({ mode: 'light', resolved: 'light' });
    expect(nativeTheme.themeSource).toBe('light');
    expect(listener).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ mode: 'light' });
    expect(await readdir(directory)).toEqual(['appearance.json']);
    await expect(controller.setAppearance('system')).resolves.toEqual({ mode: 'system', resolved: 'light' });
  });

  it('rejects rename failures and removes the temporary file', async () => {
    await controller.initialize();
    await mkdir(filePath);
    const listener = vi.fn();
    controller.subscribe(listener);
    await expect(controller.setAppearance('dark')).rejects.toThrow();
    expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'light' });
    expect(nativeTheme.themeSource).toBe('system');
    expect(listener).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual(['appearance.json']);
  });

  it('broadcasts changed system resolution, ignores duplicates, and keeps explicit modes stable', async () => {
    await controller.initialize();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    nativeTheme.update(true);
    nativeTheme.update(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ mode: 'system', resolved: 'dark' });
    expect(await readdir(directory)).toEqual([]);
    await controller.setAppearance('light');
    listener.mockClear();
    nativeTheme.update(false);
    nativeTheme.update(true);
    expect(controller.getAppearance()).toEqual({ mode: 'light', resolved: 'light' });
    expect(listener).not.toHaveBeenCalled();
    await controller.setAppearance('system');
    expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'dark' });
    unsubscribe();
    listener.mockClear();
    nativeTheme.update(false);
    expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'light' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('serializes concurrent writes in request order', async () => {
    await Promise.all([controller.setAppearance('dark'), controller.setAppearance('light'), controller.setAppearance('system')]);
    expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'light' });
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ mode: 'system' });
    expect(await readdir(directory)).toEqual(['appearance.json']);
  });

  it('rejects invalid modes without changing persistence', async () => {
    await controller.setAppearance('dark');
    await expect(controller.setAppearance('invalid' as AppearanceMode)).rejects.toThrow('Invalid appearance mode');
    expect(controller.getAppearance()).toEqual({ mode: 'dark', resolved: 'dark' });
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ mode: 'dark' });
  });

  it('returns independent snapshots to callers and subscribers', async () => {
    await controller.initialize();
    controller.getAppearance().mode = 'dark';
    controller.subscribe(state => { state.resolved = 'light'; });
    const listener = vi.fn();
    controller.subscribe(listener);
    nativeTheme.update(true);
    expect(controller.getAppearance()).toEqual({ mode: 'system', resolved: 'dark' });
    expect(listener).toHaveBeenCalledWith({ mode: 'system', resolved: 'dark' });
  });

  it('removes native listeners on disposal and rejects further operations', async () => {
    await controller.initialize();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.dispose();
    controller.dispose();
    nativeTheme.update(true);
    expect(nativeTheme.listenerCount('updated')).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    await expect(controller.initialize()).rejects.toThrow('disposed');
    await expect(controller.setAppearance('dark')).rejects.toThrow('disposed');
    expect(() => controller.subscribe(listener)).toThrow('disposed');
  });
});
