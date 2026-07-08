import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';

import { helperContract, type HelperAction, type HelperRequestEnvelope, type HelperResponseEnvelope, type TimeoutClass } from './helperContract.js';
import { contractError } from './helperRunner/contractErrors.js';
export {
  HELPER_PATH_ENV,
  PACKAGED_HELPER_SUBPATH,
  resolveHelperPath,
  type HelperPathResolution,
  type HelperPathResolutionOptions
} from './helperRunner/pathResolution.js';
import { type HelperPathResolution, type HelperPathResolutionOptions, resolveHelperPath } from './helperRunner/pathResolution.js';
import { sanitizeDiagnostic, validateHelperResponse } from './helperRunner/outputParsing.js';
import { killHelperProcess } from './helperRunner/processControl.js';

export const HELPER_TIMEOUT_MS: Record<TimeoutClass, number> = {
  'local-10s': 10_000,
  'ssh-60s': 60_000
};

export interface HelperRunner {
  cancelActive?(): void;
  run<Action extends HelperAction, Payload extends object, Data = unknown>(
    request: HelperRequestEnvelope<Action, Payload>
  ): Promise<HelperResponseEnvelope<Data>>;
}

export interface HelperRunnerOptions extends HelperPathResolutionOptions {
  timeoutMsByClass?: Partial<Record<TimeoutClass, number>>;
}

function contractTimeoutClass(action: HelperAction): TimeoutClass {
  const entry = helperContract.find((candidate) => candidate.helperAction === action);
  return entry?.timeoutClass ?? 'local-10s';
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

function runProcess(
  child: ChildProcessWithoutNullStreams,
  request: HelperRequestEnvelope<HelperAction, object>,
  timeoutMs: number,
  helperPath: string
): Promise<HelperResponseEnvelope> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (response: HelperResponseEnvelope) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      resolve(response);
    };

    const timeoutResponse = () =>
      contractError('helper_timeout', `Helper action ${request.action} timed out after ${timeoutMs} ms while running ${helperPath}.`);

    const timer = setTimeout(() => {
      timedOut = true;
      killHelperProcess(child, 'SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          killHelperProcess(child, 'SIGKILL');
        }
      }, 1000);
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

      if (timedOut) {
        finish(timeoutResponse());
        return;
      }

      if (code !== 0) {
        const diagnostic = sanitizeDiagnostic(stderr);
        const detail = diagnostic ? ` stderr: ${diagnostic}` : '';
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
  const activeChildren = new Set<ChildProcessWithoutNullStreams>();

  return {
    cancelActive() {
      for (const child of activeChildren) {
        killHelperProcess(child, 'SIGTERM');
      }
    },
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
          detached: process.platform !== 'win32',
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        activeChildren.add(child);
        try {
          return (await runProcess(child, request, timeoutMs, helperPath)) as HelperResponseEnvelope<Data>;
        } finally {
          activeChildren.delete(child);
        }
      } catch (error) {
        return contractError(
          'helper_runner_error',
          error instanceof Error ? error.message : 'Helper runner failed before returning a response envelope.'
        ) as HelperResponseEnvelope<Data>;
      }
    }
  };
}
