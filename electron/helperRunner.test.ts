import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
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
