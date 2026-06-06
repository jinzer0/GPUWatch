import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { helperContract, type HelperAction, type HelperRequestEnvelope, type HelperResponseEnvelope, type TimeoutClass } from './helperContract.js';

export const HELPER_PATH_ENV = 'GPUWATCHER_HELPER_PATH';
export const PACKAGED_HELPER_SUBPATH = path.join('gpuwatcher-helper', helperBinaryName());
export const HELPER_TIMEOUT_MS: Record<TimeoutClass, number> = {
  'local-10s': 10_000,
  'ssh-60s': 60_000
};

export interface HelperRunner {
  run<Action extends HelperAction, Payload extends object, Data = unknown>(
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>>;
}

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

export interface HelperRunnerOptions extends HelperPathResolutionOptions {
  timeoutMsByClass?: Partial<Record<TimeoutClass, number>>;
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

function contractTimeoutClass(action: HelperAction): TimeoutClass {
  const entry = helperContract.find((candidate) => candidate.helperAction === action);
  return entry?.timeoutClass ?? 'local-10s';
}

function contractError(type: string, message: string): HelperResponseEnvelope<never> {
  return {
    ok: false,
    error: {
      layer: 'helper_contract',
      type,
      message
    }
  };
}

async function firstAccessiblePath(resolution: HelperPathResolution): Promise<string | null> {
  for (const candidate of resolution.candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next deterministic helper path candidate.
    }
  }

  return null;
}

function validateHelperResponse(value: unknown): value is HelperResponseEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true) {
    return 'data' in candidate;
  }

  if (candidate.ok === false && typeof candidate.error === 'object' && candidate.error !== null && !Array.isArray(candidate.error)) {
    const error = candidate.error as Record<string, unknown>;
    return typeof error.layer === 'string' && typeof error.type === 'string' && typeof error.message === 'string';
  }

  return false;
}

function runProcess(
  child: ChildProcessWithoutNullStreams,
  request: HelperRequestEnvelope<HelperAction, object>,
  timeoutMs: number,
  helperPath: string
): Promise<HelperResponseEnvelope> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (response: HelperResponseEnvelope) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(response);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(
        contractError(
          'helper_timeout',
          `Helper action ${request.action} timed out after ${timeoutMs} ms while running ${helperPath}.`
        )
      );
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      finish(contractError('helper_runner_error', error.message));
    });
    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim() ? ` stderr: ${stderr.trim()}` : '';
        finish(contractError('helper_process_failed', `Helper exited with code ${code ?? 'null'} signal ${signal ?? 'null'}.${detail}`));
        return;
      }

      const output = stdout.trim();
      try {
        const parsed = JSON.parse(output) as unknown;
        if (!validateHelperResponse(parsed)) {
          finish(contractError('malformed_helper_stdout', 'Helper stdout was valid JSON but not a helper response envelope.'));
          return;
        }

        finish(parsed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'JSON parse failed';
        finish(contractError('malformed_helper_stdout', `Helper stdout must be exactly one JSON response envelope: ${message}.`));
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}

export function createHelperRunner(options: HelperRunnerOptions = {}): HelperRunner {
  const timeoutMsByClass = { ...HELPER_TIMEOUT_MS, ...options.timeoutMsByClass };

  return {
    async run<Action extends HelperAction, Payload extends object, Data = unknown>(
      request: HelperRequestEnvelope<Action, Payload>
    ): Promise<HelperResponseEnvelope<Data>> {
      const resolution = resolveHelperPath(options);
      const helperPath = await firstAccessiblePath(resolution);

      if (!helperPath) {
        return contractError(
          'missing_helper',
          `GPUWatcher helper binary was not found. Tried: ${resolution.candidates.join(', ')}`
        ) as HelperResponseEnvelope<Data>;
      }

      const timeoutClass = contractTimeoutClass(request.action);
      const timeoutMs = timeoutMsByClass[timeoutClass];

      try {
        const child = spawn(helperPath, [], {
          cwd: options.cwd ?? process.cwd(),
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        return (await runProcess(child, request, timeoutMs, helperPath)) as HelperResponseEnvelope<Data>;
      } catch (error) {
        return contractError(
          'helper_runner_error',
          error instanceof Error ? error.message : 'Helper runner failed before returning a response envelope.'
        ) as HelperResponseEnvelope<Data>;
      }
    }
  };
}
