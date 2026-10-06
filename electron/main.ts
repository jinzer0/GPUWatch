import { app, BrowserWindow, dialog, Menu, nativeTheme, Notification, powerMonitor } from 'electron';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ipcMain } from 'electron';
import { registerIpcScaffold } from './ipc.js';
import { createHelperRunner } from './helperRunner.js';
import { createScheduler } from './scheduler.js';
import { createMacosNotificationNotifier } from './notifications.js';
import { createAppearanceController } from './appearance.js';
import { registerUiIpc } from './uiIpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMac = process.platform === 'darwin';
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let settingsLoading: Promise<void> | null = null;
let disposeUi: (() => void) | null = null;
const testDataDirectory = process.env.GPUWATCHER_TEST_DATA_DIR;
if (testDataDirectory) {
  const userDataDirectory = path.resolve(testDataDirectory, 'electron-user-data');
  mkdirSync(userDataDirectory, { recursive: true });
  app.setPath('userData', userDataDirectory);
}
const appearance = createAppearanceController({ nativeTheme, filePath: path.join(app.getPath('userData'), 'appearance.json') });
const rendererFile = path.join(app.getAppPath(), 'dist', 'index.html');

function rendererUrl(role: 'main' | 'settings'): string {
  const url = app.isPackaged ? pathToFileURL(rendererFile) : new URL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');
  if (role === 'settings') url.searchParams.set('window', 'settings');
  return url.href;
}

function isAllowedUrl(url: string): boolean {
  return url === rendererUrl('main') || url === rendererUrl('settings');
}

function createWindow(role: 'main' | 'settings'): BrowserWindow {
  const window = new BrowserWindow({
    width: role === 'main' ? 1100 : 480,
    height: role === 'main' ? 800 : 320,
    minWidth: role === 'main' ? 880 : 420,
    minHeight: role === 'main' ? 708 : 280,
    title: role === 'main' ? 'GPUWatcher' : 'GPUWatcher 설정',
    show: false,
    backgroundColor: appearance.getAppearance().resolved === 'dark' ? '#202124' : '#F5F5F7',
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload-runtime.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl(role)) event.preventDefault();
  });
  return window;
}

async function loadWindow(window: BrowserWindow, role: 'main' | 'settings'): Promise<void> {
  if (app.isPackaged) {
    await window.loadFile(rendererFile, role === 'settings' ? { query: { window: 'settings' } } : {});
  } else {
    await window.loadURL(rendererUrl(role));
  }
  if (window.isDestroyed()) throw new Error('The window closed before loading completed.');
  window.show();
}

async function createMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const window = createWindow('main');
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  try {
    await loadWindow(window, 'main');
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

async function openSettings(): Promise<void> {
  if (settingsLoading) {
    await settingsLoading;
  } else if (!settingsWindow || settingsWindow.isDestroyed()) {
    const window = createWindow('settings');
    settingsWindow = window;
    window.on('closed', () => { if (settingsWindow === window) settingsWindow = null; });
    settingsLoading = loadWindow(window, 'settings');
    try {
      await settingsLoading;
    } catch (error) {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    } finally {
      settingsLoading = null;
    }
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
  }
}

const scheduler = createScheduler();
const helperRunner = createHelperRunner({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
registerIpcScaffold(helperRunner, scheduler);
let disposePowerMonitor: (() => void) | null = null;

function reportLifecycleError(error: unknown): void {
  console.error('GPUWatcher availability reset failed:', error);
  dialog.showErrorBox('GPU 관측을 재준비할 수 없습니다', error instanceof Error ? error.message : '앱을 다시 시작해 주세요.');
}

app.whenReady().then(async () => {
  await appearance.initialize().catch((error: unknown) => {
    console.error('Could not load appearance:', error);
  });
  disposeUi = registerUiIpc({
    ipcMain,
    getWindows: () => [mainWindow, settingsWindow].filter((window): window is BrowserWindow => window !== null),
    isAllowedUrl,
    appearance: {
      getAppearance: async () => {
        await appearance.initialize();
        return appearance.getAppearance();
      },
      setAppearance: appearance.setAppearance,
      subscribe: appearance.subscribe
    },
    openSettings
  });
  appearance.subscribe((state) => {
    for (const window of [mainWindow, settingsWindow]) {
      if (window && !window.isDestroyed()) window.setBackgroundColor(state.resolved === 'dark' ? '#202124' : '#F5F5F7');
    }
  });
  const settingsItem = {
    label: '설정…',
    accelerator: 'CmdOrCtrl+,',
    click: () => {
      void openSettings().catch((error: unknown) => {
        console.error('Could not open settings:', error);
        dialog.showErrorBox('설정을 열 수 없습니다', error instanceof Error ? error.message : '설정 창을 다시 열어 주세요.');
      });
    }
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'GPUWatcher', submenu: [...(isMac ? [{ role: 'about' as const }, { type: 'separator' as const }] : []), settingsItem, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]));
  scheduler.setNotifier(createMacosNotificationNotifier(Notification));
  const onSuspend = () => { void scheduler.suspend().catch(reportLifecycleError); };
  const onResume = () => { void scheduler.resume().catch(reportLifecycleError); };
  powerMonitor.on('suspend', onSuspend);
  powerMonitor.on('resume', onResume);
  disposePowerMonitor = () => {
    powerMonitor.removeListener('suspend', onSuspend);
    powerMonitor.removeListener('resume', onResume);
  };
  await scheduler.start(helperRunner).catch((error: unknown) => {
    // Keep the static shell available for renderer backend-error recovery.
    console.error('GPUWatcher startup availability reset failed:', error);
  });
  await createMainWindow();
  app.on('activate', () => {
    void createMainWindow().catch((error: unknown) => console.error('Could not open main window:', error));
  });
}).catch((error: unknown) => {
  console.error('GPUWatcher startup failed:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
app.on('before-quit', () => {
  disposePowerMonitor?.();
  disposePowerMonitor = null;
  disposeUi?.();
  appearance.dispose();
  scheduler.stop();
});
