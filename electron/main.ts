import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcScaffold } from './ipc.js';
import { createHelperRunner } from './helperRunner.js';
import { createScheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMac = process.platform === 'darwin';

let mainWindow: BrowserWindow | null = null;

function rendererEntryPoint(): string {
  return process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#08090a',
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload-runtime.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  } else {
    await mainWindow.loadURL(rendererEntryPoint());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const scheduler = createScheduler();
const helperRunner = createHelperRunner({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
registerIpcScaffold(helperRunner, scheduler);

app.whenReady().then(async () => {
  scheduler.start(helperRunner);
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  scheduler.stop();
});
