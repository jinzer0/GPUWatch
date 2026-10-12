// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs, readFileSync, statSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const state = vi.hoisted(() => ({
  root: '', app: '', evidence: '', dirs: [] as string[], children: [] as any[],
  corruptCopy: false, cleanupFailure: false, helperError: false, cdpFailure: false,
  killed: false, securityDiagnostic: false, invalidSignature: false,
  signatureFailure: false, ticketFailure: false, listCalls: 0, wrongRendererUrl: false,
}));
const ok = (stdout = '', stderr = '') => ({ code: 0, signal: null, timedOut: false, stdout, stderr });
const server = { name: 'Task29 Packaged Server', host: 'smoke.invalid', enabled: false };

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    cp: vi.fn(async (...args: any[]) => {
      await original.cp(...args);
      if (state.corruptCopy) await original.writeFile(path.join(args[1], 'Contents/tampered'), 'changed');
    }),
    rm: vi.fn(async (...args: any[]) => {
      await original.rm(...args);
      if (state.cleanupFailure && args[0].endsWith('/data')) throw new Error('mock cleanup failed');
    }),
    rename: vi.fn(original.rename),
    chmod: vi.fn(original.chmod),
  };
});
vi.mock('../../electron/signedRelease.mjs', async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    executeCommand: vi.fn(async (command: string, args: string[]) => {
      if (command === '/usr/bin/log') return ok(JSON.stringify([{ processID: 0, timestamp: new Date(args[args.indexOf('--end') + 1]).toISOString(), eventMessage: state.securityDiagnostic ? 'AMFI: code signature invalid for pid 12345' : 'unrelated log' }]));
      const app = args.at(-1)!;
      if (command === 'codesign') {
        const fault = !(statSync(path.join(app, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper')).mode & 0o111);
        if (state.signatureFailure || (fault && state.invalidSignature)) return { ...ok('', 'a sealed resource is missing or invalid'), code: 1 };
        return ok();
      }
      if (command === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate') return { ...ok(), code: state.ticketFailure ? 1 : 0 };
      throw new Error(`Unexpected native command: ${command} ${args.join(' ')}`);
    }),
  };
});
vi.mock('../shared/isolation.mjs', () => ({
  createIsolatedDirs: vi.fn(async () => {
    const parent = await fs.mkdtemp(path.join(state.root, 'isolated-'));
    state.dirs.push(parent);
    await fs.mkdir(path.join(parent, 'data'));
    await fs.mkdir(path.join(parent, 'home'));
    return { tempDataDir: path.join(state.root, 'alias', path.basename(parent), 'data'), tempHomeDir: path.join(state.root, 'alias', path.basename(parent), 'home') };
  }),
  createNonRepoCwd: vi.fn(async () => {
    const parent = await fs.mkdtemp(path.join(state.root, 'cwd-'));
    state.dirs.push(parent);
    const cwd = path.join(parent, 'non repo cwd with spaces');
    await fs.mkdir(cwd);
    return path.join(state.root, 'alias', path.basename(parent), path.basename(cwd));
  }),
}));
vi.mock('../shared/paths.mjs', () => ({
  get evidenceDir() { return state.evidence; },
  appExecutable: (app: string) => path.join(app, 'Contents/MacOS/GPUWatcher'),
  helperPathForApp: (app: string) => path.join(app, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper'),
  canonicalDbPath: (data: string) => path.join(data, 'GPUWatcher/gpuwatcher.sqlite3'),
  discoverAppPath: vi.fn(async (app?: string) => app ?? state.app),
}));
vi.mock('../shared/bridge.mjs', () => ({
  getBridgeInfo: vi.fn(async () => ({ url: state.wrongRendererUrl ? 'file:///mock/index.html' : pathToFileURL(path.resolve(path.dirname(state.children.at(-1).executable), '../../Contents/Resources/app.asar/dist/index.html')).href, bodyLength: 100, hasGpuwatcher: true, keys: ['helperHealth', 'listServers'], bodyHasMigrationLabels: true, electronMeta: {} })),
  assertBridgeGuardrails: vi.fn(),
  writeGuardedHelper: vi.fn(async (helper: string, _real: string, log: string) => {
    await fs.writeFile(helper, 'unsigned guard', { mode: 0o755 });
    await fs.writeFile(log, '{"action":"helper_health"}\n');
  }),
}));
vi.mock('../shared/cdp.mjs', () => ({
  connectCdp: vi.fn(async () => {
    if (state.cdpFailure) {
      if (state.killed) {
        const child = state.children.at(-1);
        child.signalCode = 'SIGKILL';
        child.emit('exit', null, 'SIGKILL');
      }
      throw new Error('mock CDP timeout');
    }
    return { socket: { close: vi.fn() } };
  }),
  evaluate: vi.fn(async () => true),
  screenshot: vi.fn(async (_cdp: any, _dir: string, name: string, record: any) => { record(name); return name; }),
}));
vi.mock('../shared/dom.mjs', () => ({
  waitForText: vi.fn(async () => 'GPUWatcher'),
  bridgeHelperHealth: vi.fn(async () => state.helperError
    ? { ok: false, error: { layer: 'helper_contract', type: 'helper_spawn_failed' } }
    : { ok: true, data: { helperVersion: '0.2.0' } }),
  bridgeListServers: vi.fn(async () => state.listCalls++ === 0 ? [] : [server]),
  clickText: vi.fn(), setCheckboxByLabel: vi.fn(), setInputByLabel: vi.fn(), waitForEnabledClickableText: vi.fn(),
  bodyText: vi.fn(async () => 'GPUWatcher Save server EACCES permission denied'),
}));
vi.mock('../shared/wait.mjs', () => ({
  waitFor: vi.fn(async (_label: string, callback: any) => {
    const result = await callback();
    if (!result) throw new Error('mock condition not satisfied');
    return result;
  }),
}));
vi.mock('../shared/processes.mjs', () => ({
  timestamp: () => 'mock timestamp',
  closeRun: vi.fn(),
  createProcessSet: vi.fn(() => ({ spawnLogged: spawn, terminate: vi.fn() })),
}));

import { cp, chmod, rename, rm } from 'node:fs/promises';
import { executeCommand, sealApp } from '../../electron/signedRelease.mjs';
import { writeGuardedHelper } from '../shared/bridge.mjs';
import { connectCdp } from '../shared/cdp.mjs';
import { setCheckboxByLabel, setInputByLabel } from '../shared/dom.mjs';
import { closeRun } from '../shared/processes.mjs';
import { runPackagedAppSmoke } from './packaged-app.mjs';
import { commandSucceeded, createPackagedCopy, runPackagedStartupScenario } from './packaged-app/startup.mjs';
import { classifyPackagedFault, runPackagedHelperErrorScenario } from './packaged-app/helper-error.mjs';

const spawn = vi.fn((_options: any) => {
  const child: any = new EventEmitter();
  child.executable = _options.command;
  child.pid = 12345;
  child.exitCode = null;
  child.signalCode = null;
  state.children.push(child);
  return child;
});
const options = () => ({ appPath: state.app, helperPath: path.join(state.app, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper'), logs: [], screenshots: [], spawnLogged: spawn, cdpPort: 9999, waitForText: vi.fn(async () => 'GPUWatcher'), timestamp: () => 'mock timestamp' });
const startup = (artifactMode = 'signed') => runPackagedStartupScenario({ ...options(), artifactMode });
const fault = (artifactMode = 'signed') => runPackagedHelperErrorScenario({ ...options(), artifactMode });
async function expectCleanup() {
  for (const directory of state.dirs) {
    const names = await fs.readdir(directory).catch(() => []);
    expect(names).toEqual([]);
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T12:00:10Z'));
  Object.assign(state, { corruptCopy: false, cleanupFailure: false, helperError: false, cdpFailure: false, killed: false, securityDiagnostic: false, invalidSignature: false, signatureFailure: false, ticketFailure: false, listCalls: 0, wrongRendererUrl: false, dirs: [], children: [] });
  state.root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-packaged-mock-')));
  state.app = path.join(state.root, 'GPUWatcher.app');
  state.evidence = path.join(state.root, 'evidence');
  await fs.symlink(state.root, path.join(state.root, 'alias'));
  await fs.mkdir(path.join(state.app, 'Contents/MacOS'), { recursive: true });
  await fs.mkdir(path.join(state.app, 'Contents/Resources/gpuwatcher-helper'), { recursive: true });
  await fs.writeFile(path.join(state.app, 'Contents/MacOS/GPUWatcher'), 'mock app', { mode: 0o755 });
  await fs.writeFile(options().helperPath, 'original helper', { mode: 0o755 });
});
afterEach(async () => { vi.useRealTimers(); await fs.rm(state.root, { recursive: true, force: true }); });

describe('packaged startup modes (mock native checks and GUI only)', () => {
  it.each([{ code: 0 }, { ...ok(), signal: undefined }, { ...ok(), timedOut: undefined }, { ...ok(), timedOut: null }, { ...ok(), stdout: undefined }, null])('rejects incomplete native completion metadata %j', result => {
    expect(commandSucceeded(result)).toBe(false);
  });

  it('launches only a canonical verified signed copy with original helper, isolated paths and disabled registry', async () => {
    const source = await sealApp(state.app);
    spawn.mockImplementationOnce((launch: any) => {
      expect(launch.command).not.toContain('/alias/');
      expect(launch.command).not.toContain(state.app);
      expect(launch.cwd).not.toContain('/alias/');
      expect(launch.env.HOME).not.toContain('/alias/');
      expect(launch.env.GPUWATCHER_TEST_DATA_DIR).not.toContain('/alias/');
      expect(launch.env.GPUWATCHER_HELPER_PATH).toBeUndefined();
      expect(readFileSync(path.join(path.dirname(path.dirname(launch.command)), 'Resources/gpuwatcher-helper/gpuwatcher-helper'), 'utf8')).toBe('original helper');
      expect(vi.mocked(executeCommand).mock.calls.map(([command]) => command)).toEqual(['codesign', 'xcrun']);
      const child: any = new EventEmitter();
      child.executable = launch.command;
      child.exitCode = null; child.signalCode = null; child.pid = 12345;
      state.children.push(child);
      return child;
    });
    const result = await startup();
    expect(result.guardUsed).toBe(false);
    expect(result.guardActions).toEqual([]);
    expect(result.signatureProof.sourceSealSha256).toBe(source.sha256);
    expect(result.signatureProof.copySealSha256).toBe(source.sha256);
    expect(result.helperHealth.data.helperVersion).toBe('0.2.0');
    expect(result.servers).toEqual([server]);
    expect(setInputByLabel).toHaveBeenCalledWith(expect.anything(), 'Host', 'smoke.invalid');
    expect(setCheckboxByLabel).toHaveBeenCalledWith(expect.anything(), 'Enabled', false);
    expect(rename).not.toHaveBeenCalled();
    expect(chmod).not.toHaveBeenCalled();
    expect(writeGuardedHelper).not.toHaveBeenCalled();
    expect((await sealApp(state.app)).sha256).toBe(source.sha256);
    await expectCleanup();
  });

  it.each(['corruptCopy', 'signatureFailure', 'ticketFailure'] as const)('refuses launch on %s and cleans owned copies', async (failure) => {
    state[failure] = true;
    await expect(startup()).rejects.toThrow(/seal differs|signature\/ticket/);
    expect(spawn).not.toHaveBeenCalled();
    expect(writeGuardedHelper).not.toHaveBeenCalled();
    await expectCleanup();
  });

  it('rejects a file renderer from another app already using the debug port', async () => {
    state.wrongRendererUrl = true;
    await expect(startup()).rejects.toThrow('Signed CDP renderer');
    expect(setInputByLabel).not.toHaveBeenCalled();
    await expectCleanup();
  });

  it('rejects another debug-port renderer as signed backend fault evidence', async () => {
    state.wrongRendererUrl = true;
    state.helperError = true;
    await expect(fault()).rejects.toThrow('Signed fault CDP renderer');
    expect(setInputByLabel).not.toHaveBeenCalled();
    await expectCleanup();
  });

  it.each([
    { ...ok(), signal: 'SIGKILL' },
    { ...ok(), timedOut: true },
  ])('refuses a nominal zero exit with signal/timeout: %j', async (result) => {
    vi.mocked(executeCommand).mockResolvedValueOnce(result);
    await expect(startup()).rejects.toThrow('signature/ticket');
    expect(spawn).not.toHaveBeenCalled();
    await expectCleanup();
  });

  it('preserves the unsigned helper rename/guard and source bytes/mode', async () => {
    const source = await sealApp(state.app);
    const result = await startup('unsigned');
    expect(result.guardUsed).toBe(true);
    expect(result.guardActions).toEqual([{ action: 'helper_health' }]);
    expect(writeGuardedHelper).toHaveBeenCalledOnce();
    expect(rename).toHaveBeenCalledTimes(2);
    expect(executeCommand).not.toHaveBeenCalled();
    expect((await sealApp(state.app)).sha256).toBe(source.sha256);
    await expectCleanup();
  });

  it('canonicalizes a symlinked temp parent before copying', async () => {
    const data = path.join(state.root, 'data');
    await fs.mkdir(data);
    const copy = await createPackagedCopy(state.app, path.join(state.root, 'alias/data'));
    expect(copy.runtimeAppPath).toBe(path.join(data, 'GPUWatcher.app'));
    expect(cp).toHaveBeenCalledWith(state.app, copy.runtimeAppPath, { recursive: true, verbatimSymlinks: true });
  });

  it('propagates cleanup errors rather than returning successful evidence', async () => {
    state.cleanupFailure = true;
    await expect(startup()).rejects.toThrow('mock cleanup failed');
    await expectCleanup();
  });

  it('removes owned directories even when process cleanup fails', async () => {
    vi.mocked(closeRun).mockRejectedValueOnce(new Error('mock process cleanup failed'));
    await expect(startup()).rejects.toThrow('mock process cleanup failed');
    await expectCleanup();
  });
});

describe('disposable helper fault classification', () => {
  it.each(['signed', 'unsigned'])('retains backend/UI error acceptance in %s when app launches', async (artifactMode) => {
    state.helperError = true;
    const source = await sealApp(state.app);
    const result = await fault(artifactMode);
    expect(result.faultClass).toBe('backend-error');
    expect(result.bridgeError.error.layer).toBe('helper_contract');
    expect(result.errorBody).toContain('EACCES');
    expect(result.navigableBody).toContain('Save server');
    if (artifactMode === 'signed') expect(result.signatureAfter.codesign.code).toBe(0);
    else expect(executeCommand).not.toHaveBeenCalled();
    expect(vi.mocked(chmod).mock.calls.every(([file]) => file !== options().helperPath)).toBe(true);
    expect(writeGuardedHelper).not.toHaveBeenCalled();
    expect((await sealApp(state.app)).sha256).toBe(source.sha256);
    await expectCleanup();
  });

  it('requires post-fault signature rejection, PID-scoped security evidence and actual termination for OS class', async () => {
    Object.assign(state, { cdpFailure: true, killed: true, invalidSignature: true, securityDiagnostic: true });
    const source = await sealApp(state.app);
    const result = await fault();
    expect(result.faultClass).toBe('os-signature-block');
    expect(result.launchOutcome).toEqual({ code: null, signal: 'SIGKILL' });
    expect(result.bridgeError).toBeUndefined();
    expect(result.signatureBefore.copySealSha256).toBe(source.sha256);
    expect(result.signatureAfter.codesign.code).toBe(1);
    expect(executeCommand).toHaveBeenCalledWith('/usr/bin/log', expect.arrayContaining(['--start', '--end', '--style', 'json', 'processID == 12345 OR eventMessage MATCHES[c] ".*(pid|process)[ :=]+12345([^0-9].*|$)"']), { timeout: 15000 });
    expect((await sealApp(state.app)).sha256).toBe(source.sha256);
    await expectCleanup();
  });

  it.each([
    { killed: false, invalidSignature: false, securityDiagnostic: false },
    { killed: true, invalidSignature: true, securityDiagnostic: false },
    { killed: true, invalidSignature: false, securityDiagnostic: true },
    { killed: false, invalidSignature: true, securityDiagnostic: true },
  ])('fails ambiguous timeout/kill rather than accepting OS success: %j', async (flags) => {
    Object.assign(state, flags, { cdpFailure: true });
    await expect(fault()).rejects.toThrow('Unresolved signed helper fault');
    await expectCleanup();
  });

  it('does not treat a timed-out signature check or unrelated nonzero verification as enforcement', () => {
    const observation = { launchOutcome: { code: null, signal: 'SIGKILL' }, osDiagnostic: ok('code signature invalid') };
    expect(classifyPackagedFault({ ...observation, signatureAfter: { codesign: { ...ok('code signature invalid'), code: 1, timedOut: true } } })).toBe('unresolved');
    expect(classifyPackagedFault({ ...observation, signatureAfter: { codesign: { ...ok('tool invocation failed'), code: 1 } } })).toBe('unresolved');
  });

  it('requires one exact-PID enforcement record within this launch window', () => {
    const observation = { launchPid: 1234, launchStartedAt: '2026-10-08T12:00:00Z', launchEndedAt: '2026-10-08T12:00:45Z', launchOutcome: { code: null, signal: 'SIGKILL' }, signatureAfter: { codesign: { ...ok('', 'code signature invalid'), code: 1 } } };
    const event = { processID: 0, timestamp: '2026-10-08 21:00:10.123456+0900', eventMessage: 'AMFI: code signature invalid for pid 1234' };
    const classify = (records: any) => classifyPackagedFault({ ...observation, osDiagnostic: ok(JSON.stringify(records)) });
    expect(classify([event])).toBe('os-signature-block');
    expect(classifyPackagedFault({ ...observation, signatureAfter: { codesign: { code: 1, stderr: 'code signature invalid' } }, osDiagnostic: ok(JSON.stringify([event])) })).toBe('unresolved');
    expect(classifyPackagedFault({ ...observation, launchOutcome: { signal: 'SIGKILL' }, osDiagnostic: ok(JSON.stringify([event])) })).toBe('unresolved');
    expect(classifyPackagedFault({ ...observation, launchOutcome: { code: 1 }, osDiagnostic: ok(JSON.stringify([event])) })).toBe('unresolved');
    expect(classify([{ ...event, eventMessage: 'AMFI: code signature invalid for pid 12345' }])).toBe('unresolved');
    expect(classify([{ ...event, processID: 12345, eventMessage: 'AMFI: code signature invalid' }])).toBe('unresolved');
    expect(classify([{ ...event, timestamp: '2026-10-08T11:59:59Z' }])).toBe('unresolved');
    expect(classify([{ ...event, timestamp: '2026-10-08T12:00:46Z' }])).toBe('unresolved');
    expect(classify([{ ...event, eventMessage: 'pid 1234 exited' }, { ...event, eventMessage: 'AMFI: code signature invalid for pid 12345' }])).toBe('unresolved');
    expect(classify({ events: [event] })).toBe('unresolved');
    expect(classifyPackagedFault({ ...observation, osDiagnostic: ok('non-json diagnostic') })).toBe('unresolved');
  });

  it('fails fault-copy preflight before launching or chmod on invalid ticket', async () => {
    state.ticketFailure = true;
    await expect(fault()).rejects.toThrow('signature/ticket');
    expect(spawn).not.toHaveBeenCalled();
    expect(chmod).not.toHaveBeenCalled();
    await expectCleanup();
  });
});

describe('packaged coordinator receipts', () => {
  it('rejects signed autodiscovery and invalid modes before launching', async () => {
    await expect(runPackagedAppSmoke({ artifactMode: 'signed' })).rejects.toThrow('explicit canonical');
    await expect(runPackagedAppSmoke({ artifactMode: 'other' })).rejects.toThrow('Invalid packaged artifact mode');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('returns signed proof and truthful evidence, with source seal unchanged', async () => {
    vi.mocked(connectCdp).mockImplementationOnce(async () => ({ socket: { close: vi.fn() } }));
    vi.mocked(connectCdp).mockImplementationOnce(async () => {
      state.helperError = true;
      return { socket: { close: vi.fn() } };
    });
    const source = await sealApp(state.app);
    const result = await runPackagedAppSmoke({ appPath: state.app, artifactMode: 'signed', evidencePrefix: 'task31-mock' });
    expect(result).toMatchObject({ ok: true, artifactMode: 'signed', sourceUnchanged: true, sourceSealSha256: source.sha256 });
    expect(result.failure.faultClass).toBe('backend-error');
    const evidence = await fs.readFile(path.join(state.evidence, 'task31-mock.txt'), 'utf8');
    expect(evidence).toContain('signed local packaged');
    expect(evidence).toContain('explicit canonical app path');
    expect(evidence).toContain('Guard used: false');
    expect(evidence).not.toContain('first match');
    await expectCleanup();
  });

  it('propagates startup failure and checks source preservation before reporting', async () => {
    vi.mocked(connectCdp).mockImplementationOnce(async () => {
      await fs.writeFile(options().helperPath, 'unexpected source mutation');
      throw new Error('mock startup failure');
    });
    await expect(runPackagedAppSmoke({ appPath: state.app, artifactMode: 'signed', evidencePrefix: 'source-check' })).rejects.toThrow('changed source app seal');
    expect(await fs.readFile(path.join(state.evidence, 'source-check-packaged-smoke-failure.txt'), 'utf8')).toContain('changed source app seal');
    await expectCleanup();
  });

  it('preserves no-argument unsigned mode and guard path', async () => {
    vi.mocked(connectCdp).mockImplementationOnce(async () => ({ socket: { close: vi.fn() } }));
    vi.mocked(connectCdp).mockImplementationOnce(async () => {
      state.helperError = true;
      return { socket: { close: vi.fn() } };
    });
    const result = await runPackagedAppSmoke();
    expect(result).toMatchObject({ ok: true, artifactMode: 'unsigned', success: { guardUsed: true }, failure: { faultClass: 'backend-error' } });
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
