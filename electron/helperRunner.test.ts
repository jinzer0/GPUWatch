import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HELPER_PATH_ENV, PACKAGED_HELPER_SUBPATH, createHelperRunner, resolveHelperPath } from './helperRunner.js';

async function createExecutableScript(source: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'gpuwatcher-helper-test-'));
  const scriptPath = path.join(directory, 'fake helper.js');
  await writeFile(scriptPath, `#!/usr/bin/env node\n${source}`, 'utf8');
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

async function waitForFile(filePath: string): Promise<string> {
  const deadline = Date.now() + 3000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, 'utf8');
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  throw lastError;
}

describe('Electron helper runner', () => {
  it('resolves helper path from explicit env path before Cargo fallback paths', () => {
    const resolution = resolveHelperPath({
      cwd: '/repo',
      env: { [HELPER_PATH_ENV]: 'custom/helper' },
      isPackaged: false,
      resourcesPath: '/resources'
    });

    expect(resolution).toEqual({
      helperPath: path.resolve('/repo', 'custom/helper'),
      source: 'env',
      candidates: [path.resolve('/repo', 'custom/helper')]
    });
  });

  it('resolves packaged helper path under process resources path placeholder', () => {
    const resolution = resolveHelperPath({
      cwd: '/repo',
      env: {},
      isPackaged: true,
      resourcesPath: '/Applications/GPUWatcher.app/Contents/Resources'
    });

    expect(resolution).toEqual({
      helperPath: path.join('/Applications/GPUWatcher.app/Contents/Resources', PACKAGED_HELPER_SUBPATH),
      source: 'packaged',
      candidates: [path.join('/Applications/GPUWatcher.app/Contents/Resources', PACKAGED_HELPER_SUBPATH)]
    });
  });

  it('invokes helper executable with request JSON on stdin and parses response JSON from stdout', async () => {
    const helperPath = await createExecutableScript(`
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  process.stderr.write('diagnostic stderr is ignored for JSON parsing');
  process.stdout.write(JSON.stringify({ ok: true, data: { action: request.action, payload: request.payload } }));
});
`);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath } });

    const response = await runner.run({ action: 'health', payload: {} });

    expect(response).toEqual({ ok: true, data: { action: 'health', payload: {} } });
  });

  it('returns structured helper error envelopes from stdout without mixing stderr diagnostics', async () => {
    const helperPath = await createExecutableScript(`
process.stdin.resume();
process.stderr.write('diagnostic stderr must not poison stdout parsing');
process.stdout.write(JSON.stringify({
  ok: false,
  error: { layer: 'storage_app', type: 'server_missing', message: 'Server was removed.' }
}));
`);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath } });

    const response = await runner.run({ action: 'list_servers', payload: {} });

    expect(response).toEqual({
      ok: false,
      error: { layer: 'storage_app', type: 'server_missing', message: 'Server was removed.' }
    });
  });

  it('returns structured timeout errors using the local 10s timeout class', async () => {
    const helperPath = await createExecutableScript(`
process.stdin.resume();
setTimeout(() => process.stdout.write(JSON.stringify({ ok: true, data: {} })), 1000);
`);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath }, timeoutMsByClass: { 'local-10s': 20 } });

    const response = await runner.run({ action: 'health', payload: {} });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toEqual({
        layer: 'helper_contract',
        type: 'helper_timeout',
        message: expect.stringContaining('timed out after 20 ms')
      });
    }
  });

  it('kills timed-out helper children before resolving the timeout response', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gpuwatcher-helper-timeout-test-'));
    const pidPath = path.join(directory, 'helper.pid');
    const helperPath = path.join(directory, 'fake-timeout-helper.sh');
    await writeFile(
      helperPath,
      `#!/bin/sh
printf "%s" "$$" > ${JSON.stringify(pidPath)}
trap '' TERM
while true; do sleep 1; done
`,
      'utf8'
    );
    await chmod(helperPath, 0o755);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath }, timeoutMsByClass: { 'ssh-60s': 2000 } });

    const pendingResponse = runner.run({ action: 'refresh_server', payload: { id: 'server-1' } });
    const childPid = Number(await waitForFile(pidPath));
    const response = await pendingResponse;

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toEqual({
        layer: 'helper_contract',
        type: 'helper_timeout',
        message: expect.stringContaining('timed out after 2000 ms')
      });
    }
    expect(() => process.kill(childPid, 0)).toThrow();
  });

  it('returns structured malformed stdout errors instead of throwing', async () => {
    const helperPath = await createExecutableScript(`
process.stdin.resume();
process.stdout.write('not json');
`);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath } });

    const response = await runner.run({ action: 'health', payload: {} });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.layer).toBe('helper_contract');
      expect(response.error.type).toBe('malformed_helper_stdout');
    }
  });

  it('sanitizes helper process stderr on nonzero exit without reading stdout as data', async () => {
    const helperPath = await createExecutableScript(`
process.stdin.resume();
process.stderr.write(${JSON.stringify('\u001b[31mPermission denied\u001b[0m\u0007\nWARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\npassword hunter2\ntoken=abc123\n/Users/alice/.ssh/id_ed25519\n')});
process.stdout.write(JSON.stringify({ ok: true, data: { misleading: true } }));
process.exit(2);
`);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath } });

    const response = await runner.run({ action: 'health', payload: {} });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.type).toBe('helper_process_failed');
      expect(response.error.message).toContain('Permission denied');
      expect(response.error.message).toContain('REMOTE HOST IDENTIFICATION');
      expect(response.error.message).toContain('password=[redacted]');
      expect(response.error.message).toContain('token=[redacted]');
      expect(response.error.message).toContain('[path redacted]');
      expect(response.error.message).not.toContain('hunter2');
      expect(response.error.message).not.toContain('abc123');
      expect(response.error.message).not.toContain('/Users/alice/.ssh/id_ed25519');
      expect(response.error.message).not.toContain('\u001b');
      expect(response.error.message).not.toContain('\u0007');
      expect(response.error.message).not.toContain('misleading');
    }
  });

  it('rejects valid JSON stdout that is not a helper response envelope', async () => {
    const helperPath = await createExecutableScript(`
process.stdin.resume();
process.stdout.write(JSON.stringify({ status: 'ok' }));
`);
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: helperPath } });

    const response = await runner.run({ action: 'health', payload: {} });

    expect(response).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'malformed_helper_stdout',
        message: 'Helper stdout was valid JSON but not a helper response envelope.'
      }
    });
  });

  it('returns structured missing helper errors for unresolved binaries', async () => {
    const missingPath = path.join(tmpdir(), 'gpuwatcher-missing-helper');
    const runner = createHelperRunner({ env: { [HELPER_PATH_ENV]: missingPath } });

    const response = await runner.run({ action: 'health', payload: {} });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toEqual({
        layer: 'helper_contract',
        type: 'missing_helper',
        message: expect.stringContaining(missingPath)
      });
    }
  });
});
