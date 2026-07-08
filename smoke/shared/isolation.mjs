import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function createIsolatedDirs(dataPrefix, homePrefix) {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), dataPrefix));
  const tempHomeDir = await mkdtemp(path.join(os.tmpdir(), homePrefix));
  return { tempDataDir, tempHomeDir };
}

export async function createNonRepoCwd(prefix) {
  const cwdParent = await mkdtemp(path.join(os.tmpdir(), prefix));
  const nonRepoCwd = path.join(cwdParent, 'non repo cwd with spaces');
  await mkdir(nonRepoCwd, { recursive: true });
  return nonRepoCwd;
}

export async function prepareIsolatedSshConfig(homeDir) {
  const sshDir = path.join(homeDir, '.ssh');
  await mkdir(sshDir, { recursive: true });
  await writeFile(
    path.join(sshDir, 'config'),
    [
      'Include missing-smoke-config',
      'Host task14-import-warning',
      '  HostName 127.0.0.1',
      '  User smoke-user',
      '  Port 22',
      '  ProxyCommand ssh -i /Users/alice/.ssh/id_ed25519 --token raw-secret %h %p',
      ''
    ].join('\n')
  );
}
