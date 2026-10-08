// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS, APPROVED_PLAN_OID, approvalInputs, loadManifest, parseCli, runAction, safePath, sealApp, sha256File, validateCredentials, verifyGatekeeper } from './signedRelease.mjs';

const TEAM = 'ABCDEFGHIJ';
const IDENTITY = `Developer ID Application: GPUWatcher (${TEAM})`;
const PROFILE = 'gpuwatcher-notary';
const SOURCE = 'a'.repeat(40);
const ID = '12345678-1234-1234-1234-123456789abc';
const PLAN = 'mydocs/plans/task_m001_31_impl.md';
const PLAN_TEXT = 'approved plan fixture\n';
const ENV = { CSC_NAME: IDENTITY, GPUWATCHER_SIGNING_TEAM_ID: TEAM, APPLE_KEYCHAIN_PROFILE: PROFILE };
const success = (stdout = '', stderr = '') => ({ code: 0, signal: null, timedOut: false, stdout, stderr });
let root: string;
let deps: any;
let commandOverride: ((executable: string, args: string[]) => any) | undefined;
let archives: Map<string, string>;
let buildHook: ((options: any) => Promise<void>) | undefined;

async function makeApp(directory: string) {
  const app = path.join(directory, 'GPUWatcher.app');
  await fs.mkdir(path.join(app, 'Contents/MacOS'), { recursive: true });
  await fs.mkdir(path.join(app, 'Contents/Resources/gpuwatcher-helper'), { recursive: true });
  await fs.writeFile(path.join(app, 'Contents/Info.plist'), 'mock plist');
  await fs.writeFile(path.join(app, 'Contents/MacOS/GPUWatcher'), 'mock arm64 executable', { mode: 0o755 });
  await fs.writeFile(path.join(app, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper'), 'mock arm64 helper', { mode: 0o755 });
  return app;
}

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-signed-test-')));
  await fs.mkdir(path.join(root, 'mydocs/plans'), { recursive: true });
  await fs.writeFile(path.join(root, PLAN), PLAN_TEXT, { mode: 0o644 });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  archives = new Map();
  commandOverride = undefined;
  buildHook = undefined;
  deps = {
    root, env: { ...ENV }, platform: 'darwin', arch: 'arm64', now: () => '2026-10-08T03:00:00.000Z',
    build: vi.fn(async (options: any) => {
      if (buildHook) return buildHook(options);
      if (options.prepackaged) await fs.writeFile(path.join(options.config.directories.output, 'GPUWatcher.dmg'), 'signed DMG');
      else await makeApp(path.join(options.config.directories.output, 'mac-arm64'));
    }),
    command: vi.fn(async (executable: string, args: string[]) => {
      const overridden = await commandOverride?.(executable, args);
      if (overridden !== undefined) return overridden;
      if (executable === 'git') {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return success(root);
        if (args[0] === 'rev-parse') return success(SOURCE);
        if (args[0] === 'diff-tree') return success(PLAN);
        if (args[0] === 'show') return success(PLAN_TEXT);
        if (args[0] === 'ls-tree') return success(`100644 blob ${'b'.repeat(40)}\t${PLAN}`);
        if (args[0] === 'ls-files') return success(`100644 ${'b'.repeat(40)} 0\t${PLAN}`);
        return success();
      }
      if (executable === 'security') return success(`  1) ${'D'.repeat(40)} "${IDENTITY}"\n     1 valid identities found`);
      if (executable === '/usr/libexec/PlistBuddy') return success(args[1].includes('Executable') ? 'GPUWatcher' : '0.2.0');
      if (executable === 'lipo') return success('arm64');
      if (executable === 'spctl') return success('', `${args.at(-1)}: accepted\nsource=Notarized Developer ID\n`);
      if (executable === 'codesign' && args.includes('--entitlements')) return success(`<plist><dict>${args.at(-1)?.endsWith('gpuwatcher-helper') ? '' : '<key>com.apple.security.cs.allow-jit</key><true/>'}</dict></plist>`);
      if (executable === 'codesign' && args[0] === '-d') return success('', `Authority=${IDENTITY}\nTeamIdentifier=${TEAM}\nflags=0x10000(runtime)\n`);
      if (executable === '/usr/bin/ditto') {
        if (args[0] === '-c') {
          const source = args.at(-2)!;
          const zip = args.at(-1)!;
          const snapshot = await fs.mkdtemp(path.join(root, '.archive-'));
          await fs.cp(source, path.join(snapshot, 'GPUWatcher.app'), { recursive: true });
          archives.set(zip, snapshot);
          await fs.writeFile(zip, `archive ${zip}`);
        } else {
          await fs.cp(archives.get(args[2])!, args[3], { recursive: true });
        }
      }
      if (executable === 'xcrun' && args[0] === 'notarytool') {
        if (args[1] === 'log') return success(JSON.stringify({ jobId: ID, status: 'Accepted', sha256: await sha256File(uploads().at(-1)![1][2]) }));
        return success(JSON.stringify({ id: args[1] === 'info' ? args[2] : ID, status: 'Accepted' }));
      }
      if (executable === 'xcrun' && args[0] === 'stapler' && args[1] === 'staple') {
        const target = args[2];
        if (target.endsWith('.app')) await fs.writeFile(path.join(target, 'Contents/ticket'), 'mock stapled app ticket');
        else await fs.appendFile(target, '\nmock DMG ticket');
      }
      return success();
    }),
  };
});

afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
const uploads = () => deps.command.mock.calls.filter(([exe, args]: any[]) => exe === 'xcrun' && args[0] === 'notarytool' && args[1] === 'submit');
async function preparedApp() {
  const built = await runAction('build', {}, deps);
  return runAction('prepare-app', { manifest: built.manifestPath }, deps);
}
async function submitPrepared(prepared: any, action = 'submit-app') {
  return runAction(action, { manifest: prepared.manifestPath, approvedManifestSha256: prepared.approval.manifestSha256, approvedArtifactSha256: prepared.approval.artifactSha256 }, deps);
}
async function preparedDmg() {
  const app = await submitPrepared(await preparedApp());
  const packaged = await runAction('package', { manifest: app.manifestPath }, deps);
  return runAction('prepare-dmg', { manifest: packaged.manifestPath }, deps);
}

describe('fixed actions and credentials', () => {
  it.each(['CSC_NAME', 'GPUWATCHER_SIGNING_TEAM_ID', 'APPLE_KEYCHAIN_PROFILE'])('rejects missing %s before build', async (key) => {
    delete deps.env[key];
    await expect(runAction('build', {}, deps)).rejects.toThrow();
    expect(deps.build).not.toHaveBeenCalled();
    expect(uploads()).toHaveLength(0);
  });
  it.each(['', ' ', '-', 'adhoc', 'Apple Development: Example (ABCDEFGHIJ)', 'Developer ID Application: Example (WRONGTEAM1)', ` ${IDENTITY}`, `${IDENTITY} `])('rejects identity %s', (identity) => {
    expect(() => validateCredentials({ ...ENV, CSC_NAME: identity }, 'darwin', 'arm64')).toThrow();
  });
  it.each(['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_KEYCHAIN', 'CSC_IDENTITY_AUTO_DISCOVERY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_API_ISSUER_ID', 'APPLE_TEAM_ID'])('rejects conflicting %s even empty', (key) => {
    expect(() => validateCredentials({ ...ENV, [key]: '' }, 'darwin', 'arm64')).toThrow('Conflicting');
  });
  it.each([['linux', 'arm64'], ['darwin', 'x64']])('rejects platform %s/%s', (platform, arch) => {
    expect(() => validateCredentials(ENV, platform, arch)).toThrow('darwin/arm64');
  });
  it('rejects whitespace profile and keychain', () => {
    expect(() => validateCredentials({ ...ENV, APPLE_KEYCHAIN_PROFILE: ' ' }, 'darwin', 'arm64')).toThrow();
    expect(() => validateCredentials({ ...ENV, APPLE_KEYCHAIN: ' ' }, 'darwin', 'arm64')).toThrow();
  });
  it('rejects arbitrary commands, duplicate flags, missing manifest and approval', async () => {
    await expect(runAction('arbitrary-command', {}, deps)).rejects.toThrow('Unsupported');
    for (const args of [['package'], ['submit-app', '--manifest', '/x'], ['build', '--shell', 'true'], ['package', '--manifest', '/x', '--manifest', '/y']]) expect(() => parseCli(args)).toThrow();
    expect(parseCli(['package', '--manifest', '/run/manifest.json'])).toEqual({ action: 'package', options: { manifest: '/run/manifest.json' } });
    expect(ACTIONS).toContain('prepare-dmg');
  });
});

describe('owned paths and signed build', () => {
  it.each(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'])('rejects %s overrides before Git commands', async (name) => {
    deps.env[name] = '/another/repository';
    await expect(runAction('build', {}, deps)).rejects.toThrow('override');
    expect(deps.command).not.toHaveBeenCalled();
  });
  it.each(['root', 'replace', 'head-plan', 'index-plan'])('rejects Git %s drift before builder runs', async (kind) => {
    commandOverride = (exe, args) => {
      if (exe !== 'git') return;
      if (kind === 'root' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') return success('/another/repository');
      if (kind === 'replace' && args[0] === 'for-each-ref') return success('refs/replace/deadbeef');
      if (kind === 'head-plan' && args[0] === 'ls-tree' && args[1] === 'HEAD') return success(`100644 blob ${'c'.repeat(40)}\t${PLAN}`);
      if (kind === 'index-plan' && args[0] === 'ls-files') return success(`100755 ${'b'.repeat(40)} 0\t${PLAN}`);
    };
    await expect(runAction('build', {}, deps)).rejects.toThrow();
    expect(deps.build).not.toHaveBeenCalled();
  });
  it('does not submit on build, uses native signer and explicit signing-only configuration', async () => {
    const result = await runAction('build', {}, deps);
    const options = deps.build.mock.calls[0][0];
    expect(options).toMatchObject({ mac: ['dir'], arm64: true, publish: 'never', config: { forceCodeSigning: true, mac: { identity: 'D'.repeat(40), sign: path.join(root, 'electron/signPackagedApp.mjs'), hardenedRuntime: true, notarize: false } } });
    expect(options.config.mac.binaries).toEqual(['Contents/Resources/gpuwatcher-helper/gpuwatcher-helper']);
    expect(result.manifest.state).toBe('signed');
    expect(result.manifest.sourceCommit).toBe(SOURCE);
    expect(result.manifest.approvedPlanOid).toBe(APPROVED_PLAN_OID);
    expect(uploads()).toHaveLength(0);
    for (const [executable, , commandOptions] of deps.command.mock.calls) if (executable === 'git') expect(commandOptions.env.GIT_NO_REPLACE_OBJECTS).toBe('1');
    const second = await runAction('build', {}, deps);
    expect(second.manifest.runDirectory).not.toBe(result.manifest.runDirectory);
  });
  it.each([0, 2])('rejects %s app candidates', async (count) => {
    buildHook = async (options) => {
      for (let i = 0; i < count; i++) await makeApp(path.join(options.config.directories.output, `candidate-${i}`));
    };
    await expect(runAction('build', {}, deps)).rejects.toThrow('exactly one');
  });
  it('rejects output symlinks and escape manifests', async () => {
    await fs.mkdir(path.join(root, 'release'));
    await fs.symlink(os.tmpdir(), path.join(root, 'release/electron'));
    await expect(runAction('build', {}, deps)).rejects.toThrow('Symlink');
    await expect(loadManifest(path.join(root, 'package.json'), deps)).rejects.toThrow('outside signed run');
    await expect(safePath(root, path.join(root, '../outside'))).rejects.toThrow('outside');
  });
  it('rejects symlink/hard-linked artifacts and unsafe app symlinks', async () => {
    const prepared = await preparedApp();
    const zip = prepared.manifest.artifacts.appZip.path;
    await fs.rename(zip, `${zip}.original`);
    await fs.symlink(`${zip}.original`, zip);
    await expect(submitPrepared(prepared)).rejects.toThrow('Symlink');
    expect(uploads()).toHaveLength(0);
    await fs.unlink(zip);
    await fs.link(`${zip}.original`, zip);
    await expect(sha256File(zip)).rejects.toThrow('single-link');
    await fs.symlink(root, path.join(prepared.manifest.appPath, 'escape'));
    await expect(sealApp(prepared.manifest.appPath)).rejects.toThrow('escapes');
  });
  it('allows internal framework links but detects target byte changes', async () => {
    const app = await makeApp(root);
    await fs.symlink('Contents/Info.plist', path.join(app, 'internal-link'));
    const before = await sealApp(app);
    await fs.appendFile(path.join(app, 'Contents/Info.plist'), 'changed');
    expect((await sealApp(app)).sha256).not.toBe(before.sha256);
  });
  it.each(['version', 'architecture', 'team', 'runtime', 'entitlements', 'verify'])('rejects invalid %s evidence', async (kind) => {
    commandOverride = (executable, args) => {
      if (kind === 'version' && executable.includes('PlistBuddy') && args[1].includes('ShortVersion')) return success('0.1.0');
      if (kind === 'architecture' && executable === 'lipo') return success('x86_64 arm64');
      if (kind === 'team' && executable === 'codesign' && args.includes('--verbose=4')) return success(`Authority=${IDENTITY}\nTeamIdentifier=WRONG\nflags=runtime`);
      if (kind === 'runtime' && executable === 'codesign' && args.includes('--verbose=4')) return success(`Authority=${IDENTITY}\nTeamIdentifier=${TEAM}`);
      if (kind === 'entitlements' && executable === 'codesign' && args.includes('--entitlements')) return success('<plist><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>');
      if (kind === 'verify' && executable === 'codesign' && args.includes('--verify')) return { ...success(), code: 1 };
    };
    await expect(runAction('build', {}, deps)).rejects.toThrow();
    expect(uploads()).toHaveLength(0);
  });
  it.each(['missing', 'mode'])('rejects %s helper', async (kind) => {
    buildHook = async (options) => {
      const app = await makeApp(options.config.directories.output);
      const helper = path.join(app, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper');
      if (kind === 'missing') await fs.unlink(helper); else await fs.chmod(helper, 0o644);
    };
    await expect(runAction('build', {}, deps)).rejects.toThrow();
  });
  it.each(['missing', 'ambiguous', 'wrong-team'])('rejects %s certificate evidence before builder runs', async (kind) => {
    commandOverride = (exe) => {
      if (exe !== 'security') return;
      if (kind === 'missing') return success('0 valid identities found');
      if (kind === 'wrong-team') return success(`1) ${'D'.repeat(40)} "Developer ID Application: GPUWatcher (WRONGTEAM1)"`);
      return success(`1) ${'D'.repeat(40)} "${IDENTITY}"\n2) ${'E'.repeat(40)} "${IDENTITY}"`);
    };
    await expect(runAction('build', {}, deps)).rejects.toThrow('certificate');
    expect(deps.build).not.toHaveBeenCalled();
  });
});

describe('exact approval and immutable submission', () => {
  it('freezes app ZIP and returns the complete approval tuple; repeated prepare never rebuilds it', async () => {
    const prepared = await preparedApp();
    expect(prepared.approval).toMatchObject({ host: 'github.com', repository: 'jinzer0/GPUWatch', repository_id: 1256824919, issue_number: 31, approvedPlanOid: APPROVED_PLAN_OID, sourceCommit: SOURCE, action: 'submit-app-zip-and-staple-app', target: 'Apple notarization service', version: '0.2.0', arch: 'arm64', identity: IDENTITY, teamId: TEAM, keychainProfile: PROFILE, keychain: null });
    expect(prepared.approval.manifestSha256).toBe(await sha256File(prepared.manifestPath));
    expect(prepared.approval.artifactSha256).toBe(await sha256File(prepared.approval.artifactPath));
    const again = await runAction('prepare-app', { manifest: prepared.manifestPath }, deps);
    expect(again.approval).toEqual(prepared.approval);
    expect(uploads()).toHaveLength(0);
  });
  it.each(['source', 'dirty', 'manifest', 'artifact', 'app', 'profile', 'plan', 'approval'])('blocks %s drift without upload', async (kind) => {
    const prepared = await preparedApp();
    if (kind === 'source') commandOverride = (exe, args) => exe === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD' ? success('c'.repeat(40)) : undefined;
    if (kind === 'dirty') commandOverride = (exe, args) => exe === 'git' && args[0] === 'status' ? success(' M electron/main.ts') : undefined;
    if (kind === 'manifest') await fs.appendFile(prepared.manifestPath, ' ');
    if (kind === 'artifact') await fs.appendFile(prepared.approval.artifactPath, 'changed');
    if (kind === 'app') await fs.appendFile(path.join(prepared.manifest.appPath, 'Contents/Info.plist'), 'changed');
    if (kind === 'profile') deps.env.APPLE_KEYCHAIN_PROFILE = 'other-profile';
    if (kind === 'plan') await fs.appendFile(path.join(root, PLAN), 'changed');
    if (kind === 'approval') prepared.approval.artifactSha256 = '0'.repeat(64);
    await expect(submitPrepared(prepared)).rejects.toThrow();
    expect(uploads()).toHaveLength(0);
  });
  it('requires explicit approval and manifest, even via API', async () => {
    const prepared = await preparedApp();
    await expect(runAction('submit-app', { manifest: prepared.manifestPath }, deps)).rejects.toThrow('approval');
    await expect(runAction('package', {}, deps)).rejects.toThrow('manifest');
    expect(uploads()).toHaveLength(0);
  });
});

describe('notarization state machine', () => {
  it.each(['', 'assessments disabled\n', 'artifact: accepted\nsource=Developer ID\n', 'artifact: rejected\nsource=Notarized Developer ID\n'])('rejects zero-exit Gatekeeper without notarized acceptance %s', async (output) => {
    commandOverride = (executable) => executable === 'spctl' ? success(output) : undefined;
    await expect(verifyGatekeeper('/test.app', 'app', deps)).rejects.toThrow(/Gatekeeper/);
    expect(uploads()).toHaveLength(0);
  });

  it('submits argv once, confirms Accepted info, staples app and records distinct seals', async () => {
    const prepared = await preparedApp();
    const accepted = await submitPrepared(prepared);
    expect(accepted.manifest.state).toBe('app-stapled');
    expect(accepted.manifest.notarization.app).toMatchObject({ id: ID, status: 'Accepted-and-stapled' });
    expect(accepted.manifest.notarization.app.submissionResponse).toMatchObject({ id: ID, status: 'Accepted' });
    expect(accepted.manifest.notarization.app.infoResponse).toMatchObject({ id: ID, status: 'Accepted' });
    expect(accepted.manifest.notarization.app.logResponse).toMatchObject({ jobId: ID, status: 'Accepted', sha256: prepared.approval.artifactSha256 });
    expect(accepted.manifest.appStaple.beforeSha256).not.toBe(accepted.manifest.appStaple.afterSha256);
    expect(accepted.manifest.artifacts.appZip.sha256).toBe(prepared.approval.artifactSha256);
    expect(uploads()).toHaveLength(1);
    expect(uploads()[0][1]).toEqual(['notarytool', 'submit', prepared.approval.artifactPath, '--wait', '--output-format', 'json', '--keychain-profile', PROFILE]);
    expect(uploads()[0][2].timeout).toBe(1800000);
    await expect(submitPrepared(prepared)).rejects.toThrow();
    expect(uploads()).toHaveLength(1);
  });
  it.each(['Invalid', 'InProgress', 'In Progress', 'malformed', 'missing-id', 'exit', 'signal', 'timeout', 'id-mismatch', 'info-failed', 'log-job-mismatch', 'log-hash-mismatch', 'log-malformed', 'log-failed'])('rejects %s and never auto-resubmits', async (kind) => {
    const prepared = await preparedApp();
    commandOverride = (exe, args) => {
      if (exe !== 'xcrun' || args[0] !== 'notarytool') return;
      if (args[1] === 'submit') {
        if (['Invalid', 'InProgress', 'In Progress'].includes(kind)) return success(JSON.stringify({ id: ID, status: kind }));
        if (kind === 'malformed') return success('not JSON');
        if (kind === 'missing-id') return success(JSON.stringify({ status: 'Accepted' }));
        if (kind === 'exit') return { ...success(JSON.stringify({ id: ID, status: 'Accepted' })), code: 1 };
        if (kind === 'signal') return { ...success(JSON.stringify({ id: ID, status: 'Accepted' })), signal: 'SIGTERM' };
        if (kind === 'timeout') return { ...success(JSON.stringify({ id: ID, status: 'In Progress' })), code: 1, timedOut: true };
      }
      if (args[1] === 'info' && kind === 'id-mismatch') return success(JSON.stringify({ id: '87654321-1234-1234-1234-123456789abc', status: 'Accepted' }));
      if (args[1] === 'info' && kind === 'info-failed') return { ...success('{}'), code: 1 };
      if (args[1] === 'log' && kind === 'log-job-mismatch') return success(JSON.stringify({ jobId: 'wrong-id', status: 'Accepted', sha256: prepared.approval.artifactSha256 }));
      if (args[1] === 'log' && kind === 'log-hash-mismatch') return success(JSON.stringify({ jobId: ID, status: 'Accepted', sha256: '0'.repeat(64) }));
      if (args[1] === 'log' && kind === 'log-malformed') return success('not JSON');
      if (args[1] === 'log' && kind === 'log-failed') return { ...success('{}'), code: 1 };
    };
    await expect(submitPrepared(prepared)).rejects.toThrow();
    const failed = await loadManifest(prepared.manifestPath, deps);
    expect(failed.manifest.state).toBe('app-failed');
    if (!['malformed', 'missing-id'].includes(kind)) expect(failed.manifest.notarization.app.id).toBe(ID);
    await expect(submitPrepared(prepared)).rejects.toThrow();
    expect(uploads()).toHaveLength(1);
    expect(deps.command.mock.calls.some(([exe, args]: any[]) => exe === 'xcrun' && args[0] === 'stapler')).toBe(false);
  });
  it('records ID recovered from non-JSON timeout output and queries info read-only', async () => {
    const prepared = await preparedApp();
    commandOverride = (exe, args) => exe === 'xcrun' && args[0] === 'notarytool' && args[1] === 'submit' ? { ...success(`id: ${ID}`), code: 1, timedOut: true } : undefined;
    await expect(submitPrepared(prepared)).rejects.toThrow('Malformed');
    const { manifest } = await loadManifest(prepared.manifestPath, deps);
    expect(manifest.notarization.app).toMatchObject({ id: ID, recoveredStatus: 'Accepted', status: 'Failed-or-uncertain' });
    expect(uploads()).toHaveLength(1);
  });
  it.each(['staple', 'validate', 'spctl'])('does not claim success after %s failure', async (kind) => {
    const prepared = await preparedApp();
    commandOverride = (exe, args) => (exe === 'xcrun' && args[0] === 'stapler' && args[1] === kind) || (exe === 'spctl' && kind === 'spctl') ? { ...success(), code: 1 } : undefined;
    await expect(submitPrepared(prepared)).rejects.toThrow();
    const { manifest } = await loadManifest(prepared.manifestPath, deps);
    expect(manifest.state).toBe('app-failed');
    expect(manifest.notarization.app.status).toBe('Accepted-verification-failed');
  });
});

describe('prepackaged distribution and separate DMG approval', () => {
  it('uses validated SHA1 qualifiers accepted by the installed native identity resolver for both builds', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const native = require('app-builder-lib/out/codeSign/macCodeSign.js');
    const previous = native.findIdentityRawResult;
    const certificateHash = 'D'.repeat(40);
    native.findIdentityRawResult = Promise.resolve([`${certificateHash} "${IDENTITY}"`]);
    try {
      expect(() => native.findIdentity('Developer ID Application', IDENTITY, null)).toThrow(/remove prefix/);
      buildHook = async (options) => {
        const selected = await native.findIdentity('Developer ID Application', options.config.mac.identity, null);
        expect(selected.hash).toBe(certificateHash);
        if (options.prepackaged) await fs.writeFile(path.join(options.config.directories.output, 'GPUWatcher.dmg'), 'signed DMG');
        else await makeApp(path.join(options.config.directories.output, 'mac-arm64'));
      };
      const prepared = await preparedDmg();
      expect(prepared.manifest.identity).toBe(IDENTITY);
      expect(prepared.approval.identity).toBe(IDENTITY);
      for (const [options] of deps.build.mock.calls) expect(options.config.mac.identity).toBe(certificateHash);
    } finally {
      native.findIdentityRawResult = previous;
    }
  });

  it('preserves stapled app; package never uploads; DMG finalizes only after separate approval', async () => {
    const prepared = await preparedDmg();
    expect(uploads()).toHaveLength(1);
    const packageOptions = deps.build.mock.calls[1][0];
    expect(packageOptions).toMatchObject({ prepackaged: prepared.manifest.appPath, mac: ['dmg'], arm64: true, config: { forceCodeSigning: true, mac: { identity: 'D'.repeat(40), notarize: false }, dmg: { sign: true } } });
    expect((await sealApp(prepared.manifest.appPath)).sha256).toBe(prepared.manifest.appStaple.afterSha256);
    expect(prepared.approval.action).toBe('submit-dmg-and-staple-dmg');
    const finalized = await submitPrepared(prepared, 'submit-dmg');
    expect(finalized.manifest.state).toBe('finalized');
    expect(finalized.manifest.dmgStaple.beforeSha256).not.toBe(finalized.manifest.dmgStaple.afterSha256);
    expect(finalized.manifest.artifacts.dmg.submissionSha256).toBe(prepared.approval.artifactSha256);
    expect(finalized.manifest.artifacts.dmg.sha256).toBe(await sha256File(finalized.manifest.artifacts.dmg.path));
    expect(uploads()).toHaveLength(2);
  });
  it('does not package an unstapled app', async () => {
    const prepared = await preparedApp();
    await expect(runAction('package', { manifest: prepared.manifestPath }, deps)).rejects.toThrow('Accepted stapled');
    expect(deps.build).toHaveBeenCalledTimes(1);
    expect(uploads()).toHaveLength(0);
  });
  it('detects builder mutation of the original app and never reaches packaged state', async () => {
    const accepted = await submitPrepared(await preparedApp());
    buildHook = async () => { await fs.appendFile(path.join(accepted.manifest.appPath, 'Contents/Info.plist'), 'mutated'); };
    await expect(runAction('package', { manifest: accepted.manifestPath }, deps)).rejects.toThrow('seal drift');
    expect((await loadManifest(accepted.manifestPath, deps)).manifest.state).toBe('package-failed');
    expect(uploads()).toHaveLength(1);
  });
  it('rejects final ZIP containing a different app and cleans extraction', async () => {
    const accepted = await submitPrepared(await preparedApp());
    commandOverride = async (exe, args) => {
      if (exe === '/usr/bin/ditto' && args[0] === '-x') { await makeApp(args[3]); await fs.writeFile(path.join(args[3], 'GPUWatcher.app/Contents/Info.plist'), 'different app'); return success(); }
    };
    await expect(runAction('package', { manifest: accepted.manifestPath }, deps)).rejects.toThrow('sealed app');
    expect((await fs.readdir(accepted.manifest.runDirectory)).filter((name) => name.startsWith('.zip-verification-'))).toEqual([]);
  });
  it('rejects DMG hash drift before any second upload', async () => {
    const prepared = await preparedDmg();
    await fs.appendFile(prepared.approval.artifactPath, 'changed');
    await expect(submitPrepared(prepared, 'submit-dmg')).rejects.toThrow('hash drift');
    expect(uploads()).toHaveLength(1);
  });
});

describe('repository release defaults', () => {
  it('keeps unsigned builder defaults and aligns root/core/helper versions and lockfiles', async () => {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const pkg = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
    const lock = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
    expect(pkg.version).toBe('0.2.0');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
    expect(pkg.devDependencies['@electron/osx-sign']).toBe('1.3.3');
    expect(pkg.build.mac.identity).toBeNull();
    expect(pkg.build.mac.sign).toBeNull();
    expect(pkg.build.directories.output).toBe('release/electron');
    expect(pkg.scripts['electron:dist:signed']).toBe('node electron/signedRelease.mjs package');
    for (const crate of ['gpuwatcher-core', 'gpuwatcher-helper']) {
      const toml = await fs.readFile(path.join(repositoryRoot, 'crates', crate, 'Cargo.toml'), 'utf8');
      const cargoLock = await fs.readFile(path.join(repositoryRoot, 'crates', crate, 'Cargo.lock'), 'utf8');
      expect(toml).toMatch(/\[package\][\s\S]*?version = "0\.2\.0"/);
      expect(cargoLock).toMatch(new RegExp(`name = "${crate}"\\nversion = "0\\.2\\.0"`));
    }
  });
});
