import { existsSync } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const root = process.cwd();
export const evidenceDir = path.join(root, '.omo', 'evidence');

export function executable(name) {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

export function electronExecutable() {
  const macElectron = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  if (process.platform === 'darwin' && existsSync(macElectron)) {
    return macElectron;
  }
  return executable('electron');
}

export function helperBinaryName() {
  return process.platform === 'win32' ? 'gpuwatcher-helper.exe' : 'gpuwatcher-helper';
}

export function devHelperPath() {
  return path.join(root, 'crates', 'gpuwatcher-helper', 'target', 'debug', helperBinaryName());
}

export function appExecutable(appPath) {
  if (process.platform === 'darwin') {
    return path.join(appPath, 'Contents', 'MacOS', 'GPUWatcher');
  }
  throw new Error(`Unsupported packaged smoke platform: ${process.platform}`);
}

export function helperPathForApp(appPath) {
  return path.join(appPath, 'Contents', 'Resources', 'gpuwatcher-helper', helperBinaryName());
}

export async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    // Signed runs are selected by explicit manifest, never by unsigned discovery.
    if (path.resolve(entryPath) === path.join(releaseElectronRoot(), 'signed')) continue;
    if (entry.isDirectory()) {
      paths.push(entryPath);
      paths.push(...await walk(entryPath));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

export function releaseElectronRoot() {
  return path.join(root, 'release', 'electron');
}

export async function discoverAppPath(explicitAppPath) {
  if (explicitAppPath !== undefined) {
    if (!path.isAbsolute(explicitAppPath) || !explicitAppPath.endsWith('.app') || await realpath(explicitAppPath) !== explicitAppPath || !(await lstat(explicitAppPath)).isDirectory()) {
      throw new Error('Expected a canonical real explicit app directory.');
    }
    return explicitAppPath;
  }
  const paths = await walk(releaseElectronRoot());
  const apps = paths.filter((candidate) => candidate.endsWith(`${path.sep}GPUWatcher.app`));
  if (apps.length !== 1) {
    throw new Error(`Expected one unsigned release/electron/**/GPUWatcher.app, found ${apps.length}.`);
  }
  return discoverAppPath(apps[0]);
}

export function canonicalDbPath(dataDir) {
  return path.join(dataDir, 'GPUWatcher', 'gpuwatcher.sqlite3');
}
