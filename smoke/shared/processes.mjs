import { spawn } from 'node:child_process';

export function timestamp() {
  return new Date().toISOString();
}

export function createProcessSet() {
  const children = [];

  const spawnLogged = ({ command, args, cwd, env, onOutput, onExit }) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    children.push(child);
    child.stdout.on('data', (chunk) => onOutput('stdout', chunk));
    child.stderr.on('data', (chunk) => onOutput('stderr', chunk));
    if (onExit) {
      child.on('exit', onExit);
    }
    return child;
  };

  return { children, spawnLogged, terminate: () => terminateChildren(children) };
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

export async function terminateChildren(children) {
  const exits = [];
  for (const child of [...children].reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) {
      continue;
    }
    exits.push(
      (async () => {
        child.kill('SIGTERM');
        const exitedAfterTerm = await waitForExit(child, 2500);
        if (!exitedAfterTerm && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await waitForExit(child, 2500);
        }
      })()
    );
  }
  await Promise.all(exits);
}

export async function closeRun(cdp, child) {
  cdp?.socket?.close();
  await terminateChildren(child ? [child] : []);
}
