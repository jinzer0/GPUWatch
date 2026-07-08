import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export function killHelperProcess(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to killing the direct child if process-group signaling is unavailable.
    }
  }

  child.kill(signal);
}
