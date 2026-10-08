// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APPROVED_PLAN_OID, REPOSITORY, sealApp, sha256File } from '../electron/signedRelease.mjs';
import { parseCli, runSignedArtifactSmoke } from './electron-signed-dist-artifacts.mjs';
import { discoverAppPath } from './shared/paths.mjs';

const team = 'ABCDEFGHIJ';
const identity = `Developer ID Application: GPUWatcher (${team})`;
const ids = { app: '12345678-1234-1234-1234-123456789abc', dmg: '22345678-1234-1234-1234-123456789abc' };
const ok = (stdout = '', stderr = '') => ({ code: 0, signal: null, timedOut: false, stdout, stderr });
let root: string;
let run: string;
let manifestPath: string;
let manifest: any;
let deps: any;
let override: ((executable: string, args: string[]) => any) | undefined;

async function save() { await fs.writeFile(manifestPath, JSON.stringify(manifest)); }
async function temporaryDirectories() { return (await fs.readdir(run)).filter(name => name.startsWith('.signed-smoke-')); }
async function copyApp(directory: string, name = 'GPUWatcher.app') {
  await fs.cp(manifest.appPath, path.join(directory, name), { recursive: true, verbatimSymlinks: true });
}
const calls = (exe: string) => deps.command.mock.calls.filter(([executable]: any[]) => executable === exe);
const verify = () => runSignedArtifactSmoke({ manifest: manifestPath }, deps);

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-signed-smoke-test-')));
  run = path.join(root, 'release/electron/signed/run');
  const appPath = path.join(run, 'GPUWatcher.app');
  await fs.mkdir(path.join(appPath, 'Contents/MacOS'), { recursive: true });
  await fs.mkdir(path.join(appPath, 'Contents/Resources/gpuwatcher-helper'), { recursive: true });
  await fs.writeFile(path.join(appPath, 'Contents/Info.plist'), 'mock plist');
  await fs.writeFile(path.join(appPath, 'Contents/MacOS/GPUWatcher'), 'mock executable', { mode: 0o755 });
  await fs.writeFile(path.join(appPath, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper'), 'mock helper', { mode: 0o755 });
  await fs.writeFile(path.join(appPath, 'Contents/ticket'), 'mock app ticket');
  const seal = await sealApp(appPath);
  const artifacts: any = {};
  for (const [name, filename] of [['appZip', 'app-submission.zip'], ['zip', 'distribution.zip'], ['dmg', 'distribution.dmg']]) {
    const file = path.join(run, filename);
    await fs.writeFile(file, `mock ${name} artifact`);
    artifacts[name] = { path: file, sha256: await sha256File(file) };
  }
  artifacts.dmg.submissionSha256 = 'b'.repeat(64);
  manifestPath = path.join(run, 'manifest.json');
  manifest = {
    ...REPOSITORY, schemaVersion: 1, approvedPlanOid: APPROVED_PLAN_OID, sourceCommit: 'a'.repeat(40),
    version: '0.2.0', arch: 'arm64', runDirectory: run, appPath, identity, teamId: team,
    keychainProfile: 'gpuwatcher-notary', keychain: '/mock/login.keychain-db', state: 'finalized',
    appFiles: seal.files, appSealSha256: seal.sha256, signedAppSealSha256: 'c'.repeat(64), artifacts,
    appStaple: { beforeSha256: 'c'.repeat(64), afterSha256: seal.sha256 },
    dmgStaple: { beforeSha256: artifacts.dmg.submissionSha256, afterSha256: artifacts.dmg.sha256 }, notarization: {},
  };
  for (const target of ['app', 'dmg'] as const) {
    const artifact = artifacts[target === 'app' ? 'appZip' : 'dmg'];
    const submitted = target === 'app' ? artifact.sha256 : artifact.submissionSha256;
    manifest.notarization[target] = {
      status: 'Accepted-and-stapled', submissionStatus: 'Accepted', infoStatus: 'Accepted', id: ids[target],
      infoId: ids[target], logJobId: ids[target], logSha256: submitted, exitCode: 0, signal: null, timedOut: false,
      approval: { ...REPOSITORY, target: 'Apple notarization service', approvedPlanOid: APPROVED_PLAN_OID,
        sourceCommit: manifest.sourceCommit, version: manifest.version, arch: manifest.arch, identity, teamId: team,
        keychainProfile: manifest.keychainProfile, keychain: manifest.keychain, manifestPath, manifestSha256: 'd'.repeat(64),
        artifactPath: artifact.path, artifactSha256: submitted,
        appSealSha256: target === 'app' ? manifest.signedAppSealSha256 : manifest.appSealSha256,
        action: target === 'app' ? 'submit-app-zip-and-staple-app' : 'submit-dmg-and-staple-dmg' },
    };
  }
  await save();
  override = undefined;
  deps = {
    root, env: { CSC_NAME: identity, GPUWATCHER_SIGNING_TEAM_ID: team, APPLE_KEYCHAIN_PROFILE: manifest.keychainProfile, APPLE_KEYCHAIN: manifest.keychain }, platform: 'darwin', arch: 'arm64',
    runtimeSmoke: vi.fn(async () => {}),
    command: vi.fn(async (exe: string, args: string[]) => {
      const overridden = await override?.(exe, args);
      if (overridden !== undefined) return overridden;
      if (exe === '/usr/libexec/PlistBuddy') return ok(args[1].includes('Executable') ? 'GPUWatcher' : '0.2.0');
      if (exe === 'lipo') return ok('arm64');
      if (exe === 'codesign' && args.includes('--entitlements')) return ok(`<plist><dict>${args.at(-1)?.endsWith('gpuwatcher-helper') ? '' : '<key>com.apple.security.cs.allow-jit</key><true/>'}</dict></plist>`);
      if (exe === 'codesign' && args[0] === '-d') return ok('', `Authority=${identity}\nTeamIdentifier=${team}\nflags=0x10000(runtime)\n`);
      if (exe === 'xcrun' && args[0] === 'notarytool') {
        const target = args[2] === ids.app ? 'app' : 'dmg';
        if (args[1] === 'info') return ok(JSON.stringify({ id: args[2], status: 'Accepted' }));
        if (args[1] === 'log') return ok(JSON.stringify({ jobId: args[2], status: 'Accepted', sha256: manifest.notarization[target].approval.artifactSha256 }));
        throw new Error('Unexpected Apple write');
      }
      if (exe === '/usr/bin/ditto') { await copyApp(args[3]); return ok(); }
      if (exe === 'hdiutil' && args[0] === 'attach') {
        await copyApp(args[4]);
        await fs.symlink('/Applications', path.join(args[4], 'Applications'));
        return ok(`/dev/disk9s1\tApple_HFS\t${args[4]}\n`);
      }
      if (exe === 'hdiutil' && args[0] === 'detach') return ok();
      if (exe === 'hdiutil' && args[0] === 'info') return ok('<plist/>');
      if (exe === 'plutil') return ok(JSON.stringify({ images: [] }));
      if (exe === 'spctl') return ok('', `${args.at(-1)}: accepted\nsource=Notarized Developer ID\norigin=${identity}\n`);
      if (exe === 'codesign' || (exe === 'xcrun' && args[0] === 'stapler' && args[1] === 'validate')) return ok();
      throw new Error(`Unexpected command ${exe} ${args.join(' ')}`);
    }),
  };
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('signed artifact smoke', () => {
  it('requires exactly one canonical explicit CLI input without executing on import', () => {
    expect(deps.command).not.toHaveBeenCalled();
    expect(parseCli(['--manifest', manifestPath])).toEqual({ manifest: manifestPath });
    for (const args of [[], ['--manifest', 'relative.json'], ['--manifest', manifestPath, '--submit'], ['--manifest', manifestPath, '--manifest', manifestPath]]) expect(() => parseCli(args)).toThrow();
  });

  it('checks the real tree, hashes, app/helper/DMG OS proof, read-only Apple bindings and explicit isolated runtime input', async () => {
    const before = await sealApp(manifest.appPath);
    const manifestBefore = await fs.readFile(manifestPath, 'utf8');
    await expect(verify()).resolves.toMatchObject({ state: 'verified', appPath: manifest.appPath });
    expect(deps.runtimeSmoke).toHaveBeenCalledWith({ appPath: manifest.appPath, evidencePrefix: 'task-31-signed-dist' });
    expect(await discoverAppPath(manifest.appPath)).toBe(manifest.appPath);
    expect(await sealApp(manifest.appPath)).toEqual(before);
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(manifestBefore);
    expect(await temporaryDirectories()).toEqual([]);
    expect(calls('xcrun').filter(([, args]: any[]) => args[0] === 'notarytool').map(([, args]: any[]) => args[1])).toEqual(['info', 'log', 'info', 'log']);
    for (const [, args, options] of calls('xcrun')) {
      if (args[0] === 'notarytool') expect(args.slice(-4)).toEqual(['--keychain-profile', manifest.keychainProfile, '--keychain', manifest.keychain]);
      expect(options.timeout).toBe(120000);
    }
    expect(calls('xcrun').some(([, args]: any[]) => ['submit', 'staple'].includes(args[1]))).toBe(false);
    expect(calls('hdiutil')[0][1].slice(0, 4)).toEqual(['attach', '-readonly', '-nobrowse', '-mountpoint']);
    expect(calls('hdiutil')[1][1]).toEqual(['detach', calls('hdiutil')[0][1][4]]);
    expect(calls('spctl').some(([, args]: any[]) => args.join(' ').includes('--type open --context context:primary-signature'))).toBe(true);
    for (const [, args] of calls('spctl')) expect(args.slice(0, 2)).toEqual(['--assess', '--verbose=4']);
    expect(calls('xcrun').some(([, args]: any[]) => args[0] === 'stapler' && args[2].endsWith('.zip'))).toBe(false);
  });

  it.each(['app', 'dmg'])('rejects disabled assessment, warn-only, local exception and missing notarized evidence for %s despite exit0', async kind => {
    for (const output of [
      'assessments disabled\n',
      'warning: assessment disabled\naccepted\nsource=Notarized Developer ID\n',
      'accepted\nsource=Local Policy\n',
      'accepted\nsource=Developer ID\n',
      'source=Notarized Developer ID\n',
      '',
    ]) {
      override = (exe, args) => {
        if (exe === 'spctl' && args.at(-1)?.endsWith(kind === 'app' ? '.app' : '.dmg')) return ok('', output);
      };
      await expect(verify()).rejects.toThrow();
      expect(deps.runtimeSmoke).not.toHaveBeenCalled();
      expect(await temporaryDirectories()).toEqual([]);
    }
  });

  it.each([
    ['state', (m: any) => { m.state = 'dmg-prepared'; }],
    ['status', (m: any) => { m.notarization.app.status = 'Accepted'; }],
    ['submission status', (m: any) => { m.notarization.dmg.submissionStatus = 'In Progress'; }],
    ['ID', (m: any) => { m.notarization.app.infoId = ids.dmg; }],
    ['log ID', (m: any) => { m.notarization.dmg.logJobId = ids.app; }],
    ['upload SHA', (m: any) => { m.notarization.app.logSha256 = 'e'.repeat(64); }],
    ['approval SHA', (m: any) => { m.notarization.dmg.approval.artifactSha256 = m.artifacts.dmg.sha256; }],
    ['profile tuple', (m: any) => { m.notarization.app.approval.keychainProfile = 'other'; }],
    ['app staple', (m: any) => { m.appStaple.afterSha256 = 'e'.repeat(64); }],
    ['DMG staple', (m: any) => { m.dmgStaple.beforeSha256 = m.artifacts.dmg.sha256; }],
    ['notarization exit', (m: any) => { m.notarization.app.exitCode = 1; }],
    ['notarization signal', (m: any) => { m.notarization.app.signal = 'SIGTERM'; }],
    ['schema', (m: any) => { m.schemaVersion = 2; }],
  ])('rejects manifest %s mismatch before running OS commands', async (_name, mutate) => {
    mutate(manifest); await save();
    await expect(verify()).rejects.toThrow();
    expect(deps.command).not.toHaveBeenCalled();
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
  });

  it.each(['appZip', 'zip', 'dmg'])('rejects actual %s final hash drift', async name => {
    await fs.appendFile(manifest.artifacts[name].path, 'drift');
    await expect(verify()).rejects.toThrow('final hash');
    expect(deps.command).not.toHaveBeenCalled();
  });

  it.each(['info-ID', 'info-status', 'log-ID', 'log-status', 'uploaded-SHA', 'missing-SHA', 'malformed', 'null'])('rejects read-only Apple %s result', async failure => {
    override = (exe, args) => {
      if (exe !== 'xcrun' || args[0] !== 'notarytool') return;
      if (failure === 'malformed') return ok('not json');
      if (failure === 'null') return ok('null');
      if (args[1] === 'info' && failure.startsWith('info')) return ok(JSON.stringify({ id: failure === 'info-ID' ? ids.dmg : args[2], status: failure === 'info-status' ? 'Invalid' : 'Accepted' }));
      if (args[1] === 'log') return ok(JSON.stringify({ jobId: failure === 'log-ID' ? ids.dmg : args[2], status: failure === 'log-status' ? 'Invalid' : 'Accepted', sha256: failure === 'missing-SHA' ? undefined : 'e'.repeat(64) }));
    };
    await expect(verify()).rejects.toThrow();
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
  });

  it.each(['APPLE_ID', 'APPLE_API_KEY', 'CSC_LINK', 'APPLE_KEYCHAIN_PROFILE', 'APPLE_KEYCHAIN', 'CSC_NAME'])('rejects conflicting or mismatched credential %s', async name => {
    deps.env[name] = 'other';
    await expect(verify()).rejects.toThrow();
    expect(deps.command).not.toHaveBeenCalled();
  });

  it.each(['info', 'log', 'stapler', 'spctl', 'codesign'])('rejects nonzero/signal/timeout %s results', async stage => {
    for (const failure of ['exit', 'signal', 'timeout']) {
      override = (exe, args) => {
        const selected = stage === 'info' || stage === 'log'
          ? exe === 'xcrun' && args[0] === 'notarytool' && args[1] === stage
          : stage === 'stapler' ? exe === 'xcrun' && args[0] === 'stapler' : exe === stage;
        if (selected) return { ...ok(), code: failure === 'exit' ? 1 : 0, signal: failure === 'signal' ? 'SIGTERM' : null, timedOut: failure === 'timeout' };
      };
      await expect(verify()).rejects.toThrow('Command failed');
      expect(await temporaryDirectories()).toEqual([]);
      expect(deps.runtimeSmoke).not.toHaveBeenCalled();
    }
  });

  it.each(['version', 'arch', 'helper-arch', 'unsigned-app', 'unsigned-helper', 'wrong-team', 'runtime', 'DMG-team'])('rejects actual %s OS proof', async failure => {
    override = (exe, args) => {
      if (failure === 'version' && exe === '/usr/libexec/PlistBuddy' && args[1].includes('ShortVersion')) return ok('0.1.0');
      if (exe === 'lipo' && (failure === 'arch' || (failure === 'helper-arch' && args[1].endsWith('gpuwatcher-helper')))) return ok('x86_64');
      if (exe === 'codesign' && args[0] === '-d' && !args.includes('--entitlements')) {
        const target = args.at(-1)!;
        if ((failure === 'unsigned-app' && target.endsWith('.app')) || (failure === 'unsigned-helper' && target.endsWith('gpuwatcher-helper'))) return ok('Signature=adhoc');
        if (failure === 'wrong-team' || (failure === 'DMG-team' && target.endsWith('.dmg'))) return ok(`Authority=${identity}\nTeamIdentifier=OTHERTEAM0\nflags=runtime\n`);
        if (failure === 'runtime') return ok(`Authority=${identity}\nTeamIdentifier=${team}\n`);
      }
    };
    await expect(verify()).rejects.toThrow();
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
  });

  it('rejects a missing helper rather than accepting unsigned runtime fallback', async () => {
    await fs.rm(path.join(manifest.appPath, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper'));
    const seal = await sealApp(manifest.appPath);
    manifest.appFiles = seal.files; manifest.appSealSha256 = seal.sha256;
    manifest.appStaple.afterSha256 = seal.sha256; manifest.notarization.dmg.approval.appSealSha256 = seal.sha256; await save();
    await expect(verify()).rejects.toThrow();
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
  });

  it.each(['zip', 'dmg'])('rejects zero/multiple/symlink %s app candidates with owned cleanup', async format => {
    for (const count of ['zero', 'multiple', 'symlink']) {
      deps.command.mockClear();
      override = async (exe, args) => {
        if (!((format === 'zip' && exe === '/usr/bin/ditto') || (format === 'dmg' && exe === 'hdiutil' && args[0] === 'attach'))) return;
        const directory = args[format === 'zip' ? 3 : 4];
        if (count === 'multiple') { await copyApp(directory); await copyApp(directory, 'Other.app'); }
        if (count === 'symlink') await fs.symlink(manifest.appPath, path.join(directory, 'GPUWatcher.app'));
        return format === 'dmg' ? ok(`/dev/disk9s1\tApple_HFS\t${directory}\n`) : ok();
      };
      await expect(verify()).rejects.toThrow();
      expect(await temporaryDirectories()).toEqual([]);
      expect(deps.runtimeSmoke).not.toHaveBeenCalled();
      if (format === 'dmg') expect(calls('hdiutil').at(-1)[1][0]).toBe('detach');
    }
  });

  it('rejects internal escaping links and a non-Applications DMG link without following it', async () => {
    override = async (exe, args) => {
      if (exe === 'hdiutil' && args[0] === 'attach') {
        await copyApp(args[4]);
        await fs.symlink(root, path.join(args[4], 'outside'));
        return ok(`/dev/disk9s1\tApple_HFS\t${args[4]}\n`);
      }
    };
    await expect(verify()).rejects.toThrow('Symlink');
    expect(await temporaryDirectories()).toEqual([]);
    override = async (exe, args) => {
      if (exe === '/usr/bin/ditto') {
        await copyApp(args[3]);
        await fs.symlink(root, path.join(args[3], 'GPUWatcher.app/Contents/escape'));
        return ok();
      }
    };
    await expect(verify()).rejects.toThrow('escapes');
    expect(await temporaryDirectories()).toEqual([]);
  });

  it.each(['extract-exit', 'extract-signal', 'mount-exit', 'mount-signal', 'mount-timeout', 'mount-proof', 'app-validation'])('fails %s and cleans only owned temporary state', async failure => {
    override = async (exe, args) => {
      if (failure.startsWith('extract') && exe === '/usr/bin/ditto') return { ...ok(), code: failure === 'extract-exit' ? 1 : 0, signal: failure === 'extract-signal' ? 'SIGTERM' : null };
      if (failure.startsWith('mount') && exe === 'hdiutil' && args[0] === 'attach') return { ...ok(failure === 'mount-proof' ? '/dev/disk8s1\tApple_HFS\t/unowned-volume\n' : `/dev/disk9s1\tApple_HFS\t${args[4]}\n`), code: failure === 'mount-exit' ? 1 : 0, signal: failure === 'mount-signal' ? 'SIGTERM' : null, timedOut: failure === 'mount-timeout' };
      if (failure === 'app-validation' && exe === 'codesign' && args.at(-1)?.includes('.signed-smoke-dmg-')) return { ...ok(), code: 1 };
    };
    await expect(verify()).rejects.toThrow();
    expect(await temporaryDirectories()).toEqual([]);
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
    for (const [, args] of calls('hdiutil')) if (args[0] === 'detach') expect(args[1].startsWith(`${run}/.signed-smoke-dmg-`)).toBe(true);
  });

  it('fails detach without recursively deleting a potentially mounted tree', async () => {
    override = (exe, args) => exe === 'hdiutil' && args[0] === 'detach' ? { ...ok(), code: 1 } : undefined;
    await expect(verify()).rejects.toThrow('hdiutil');
    expect((await temporaryDirectories()).length).toBe(1);
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
  });

  it('recovers only its own mounted image after attach loses its stdout proof', async () => {
    let ownedMount = '';
    override = (exe, args) => {
      if (exe === 'hdiutil' && args[0] === 'attach') { ownedMount = args[4]; return { ...ok(), timedOut: true }; }
      if (exe === 'plutil') return ok(JSON.stringify({ images: [{ 'image-path': manifest.artifacts.dmg.path, 'system-entities': [{ 'mount-point': ownedMount, 'dev-entry': '/dev/disk9s1' }] }] }));
    };
    await expect(verify()).rejects.toThrow('hdiutil');
    expect(calls('hdiutil').some(([, args]: any[]) => args[0] === 'detach' && args[1] === ownedMount)).toBe(true);
    expect(await temporaryDirectories()).toEqual([]);
  });

  it('retains an uncertain mount tree when ownership cannot be established', async () => {
    override = (exe, args) => {
      if (exe === 'hdiutil' && args[0] === 'attach') return { ...ok(), timedOut: true };
      if (exe === 'hdiutil' && args[0] === 'info') return { ...ok(), code: 1 };
    };
    await expect(verify()).rejects.toThrow('hdiutil');
    expect(calls('hdiutil').some(([, args]: any[]) => args[0] === 'detach')).toBe(false);
    expect((await temporaryDirectories()).length).toBe(1);
    expect(deps.runtimeSmoke).not.toHaveBeenCalled();
  });

  it('cleans extraction on extracted app seal drift and preserves the original app', async () => {
    const before = await sealApp(manifest.appPath);
    override = async (exe, args) => {
      if (exe === '/usr/bin/ditto') {
        await copyApp(args[3]);
        await fs.appendFile(path.join(args[3], 'GPUWatcher.app/Contents/ticket'), 'drift');
        return ok();
      }
    };
    await expect(verify()).rejects.toThrow('Artifact app seal');
    expect(await temporaryDirectories()).toEqual([]);
    expect(await sealApp(manifest.appPath)).toEqual(before);
  });

  it('propagates runtime failures and detects original app mutation even when runtime returns success', async () => {
    deps.runtimeSmoke.mockRejectedValueOnce(new Error('runtime failed'));
    await expect(verify()).rejects.toThrow('runtime failed');
    expect(await temporaryDirectories()).toEqual([]);
    deps.runtimeSmoke.mockImplementationOnce(async () => { await fs.appendFile(path.join(manifest.appPath, 'Contents/ticket'), 'mutation'); });
    await expect(verify()).rejects.toThrow('Source app seal');
  });

  it('rejects symlink manifest and explicit app paths', async () => {
    const link = path.join(run, 'linked.app');
    await fs.symlink(manifest.appPath, link);
    await expect(discoverAppPath(link)).rejects.toThrow();
    const linkedManifest = path.join(run, 'linked-manifest.json');
    await fs.symlink(manifestPath, linkedManifest);
    await expect(runSignedArtifactSmoke({ manifest: linkedManifest }, deps)).rejects.toThrow('Symlink');
    expect(deps.command).not.toHaveBeenCalled();
  });

  it('keeps signed runs out of unsigned artifact and app discovery', async () => {
    await copyApp(path.join(root, 'release/electron/mac-arm64'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      vi.resetModules();
      const paths = await import('./shared/paths.mjs');
      expect(await paths.discoverAppPath()).toBe(path.join(root, 'release/electron/mac-arm64/GPUWatcher.app'));
      expect((await paths.walk(paths.releaseElectronRoot())).some(candidate => candidate.startsWith(run))).toBe(false);
      await copyApp(path.join(root, 'release/electron/mac'));
      await expect(paths.discoverAppPath()).rejects.toThrow('found 2');
    } finally {
      cwd.mockRestore();
      vi.resetModules();
    }
  });
});
