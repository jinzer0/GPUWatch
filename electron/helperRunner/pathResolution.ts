import path from 'node:path';

export const HELPER_PATH_ENV = 'GPUWATCHER_HELPER_PATH';
export const PACKAGED_HELPER_SUBPATH = path.join('gpuwatcher-helper', helperBinaryName());

export interface HelperPathResolutionOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  isPackaged?: boolean;
  resourcesPath?: string;
}

export interface HelperPathResolution {
  helperPath: string;
  source: 'env' | 'packaged' | 'cargo-crate-target' | 'cargo-root-target';
  candidates: string[];
}

function helperBinaryName(): string {
  return process.platform === 'win32' ? 'gpuwatcher-helper.exe' : 'gpuwatcher-helper';
}

function absoluteFrom(base: string, candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(base, candidate);
}

export function resolveHelperPath(options: HelperPathResolutionOptions = {}): HelperPathResolution {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const candidates: string[] = [];
  const envPath = env[HELPER_PATH_ENV];

  if (envPath && envPath.trim().length > 0) {
    const helperPath = absoluteFrom(cwd, envPath.trim());
    return { helperPath, source: 'env', candidates: [helperPath] };
  }

  if (options.isPackaged) {
    const resourcesPath = options.resourcesPath ?? process.resourcesPath;
    const helperPath = path.join(resourcesPath, PACKAGED_HELPER_SUBPATH);
    return { helperPath, source: 'packaged', candidates: [helperPath] };
  }

  const crateTarget = path.join(cwd, 'crates', 'gpuwatcher-helper', 'target', 'debug', helperBinaryName());
  const rootTarget = path.join(cwd, 'target', 'debug', helperBinaryName());
  candidates.push(crateTarget, rootTarget);

  return { helperPath: crateTarget, source: 'cargo-crate-target', candidates };
}
