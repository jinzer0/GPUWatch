import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED_PLAN_OID, REPOSITORY, verifyArtifactSource, verifyGatekeeper, executeCommand, loadManifest, safePath, sealApp, sha256File, validateApp, validateCredentials } from '../electron/signedRelease.mjs';
import { runPackagedAppSmoke } from './scenarios/packaged-app.mjs';
import { commandSucceeded } from './scenarios/packaged-app/startup.mjs';
import { classifyPackagedFault } from './scenarios/packaged-app/helper-error.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = /^[a-f0-9]{64}$/;
const requestId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail = (message) => { throw new Error(message); };
const equal = (actual, expected, label) => { if (actual !== expected) fail(`${label} mismatch`); };

export function parseCli(argv) {
  if (argv.length !== 2 || argv[0] !== '--manifest' || !path.isAbsolute(argv[1])) fail('Expected --manifest <canonical absolute manifest path>');
  return { manifest: argv[1] };
}

function finalizedBindings(manifest, manifestPath) {
  if (manifest.state !== 'finalized') fail('Signed smoke requires finalized manifest');
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? '')) fail('Invalid source commit');
  for (const key of ['appSealSha256', 'signedAppSealSha256']) if (!hash.test(manifest[key] ?? '')) fail(`Missing ${key}`);
  if (!Array.isArray(manifest.appFiles)) fail('Missing app file seal');
  for (const name of ['appZip', 'zip', 'dmg']) {
    if (!hash.test(manifest.artifacts?.[name]?.sha256 ?? '')) fail(`Missing ${name} hash`);
  }
  equal(manifest.appStaple?.beforeSha256, manifest.signedAppSealSha256, 'App staple before');
  equal(manifest.appStaple?.afterSha256, manifest.appSealSha256, 'App staple after');
  equal(manifest.dmgStaple?.beforeSha256, manifest.artifacts.dmg.submissionSha256, 'DMG staple before');
  equal(manifest.dmgStaple?.afterSha256, manifest.artifacts.dmg.sha256, 'DMG staple after');
  if (!hash.test(manifest.artifacts.dmg.submissionSha256 ?? '')) fail('Missing DMG submission hash');
  for (const target of ['app', 'dmg']) {
    const record = manifest.notarization?.[target];
    if (record?.status !== 'Accepted-and-stapled' || record.submissionStatus !== 'Accepted' || record.infoStatus !== 'Accepted' || !requestId.test(record.id ?? '') || record.exitCode !== 0 || record.signal || record.timedOut) fail(`Missing successful ${target} notarization`);
    equal(record.infoId, record.id, 'Notarization info ID');
    equal(record.logJobId, record.id, 'Notarization log ID');
    const artifact = manifest.artifacts[target === 'app' ? 'appZip' : 'dmg'];
    const submittedHash = target === 'app' ? artifact.sha256 : artifact.submissionSha256;
    equal(record.logSha256, submittedHash, 'Uploaded SHA');
    const approval = record.approval;
    if (!approval || !hash.test(approval.manifestSha256 ?? '')) fail('Missing submission approval tuple');
    const expected = { ...REPOSITORY, target: 'Apple notarization service', approvedPlanOid: APPROVED_PLAN_OID, sourceCommit: manifest.sourceCommit, version: manifest.version, arch: manifest.arch, identity: manifest.identity, teamId: manifest.teamId, keychain: manifest.keychain, keychainProfile: manifest.keychainProfile, manifestPath, artifactPath: artifact.path, artifactSha256: submittedHash, appSealSha256: target === 'app' ? manifest.signedAppSealSha256 : manifest.appSealSha256, action: target === 'app' ? 'submit-app-zip-and-staple-app' : 'submit-dmg-and-staple-dmg' };
    for (const [key, value] of Object.entries(expected)) equal(approval[key], value, `Approval ${key}`);
  }
}

// Inspect entries with lstat: never traverse the DMG's Applications link.
async function discoverApp(directory, allowApplications = false) {
  const apps = [];
  async function visit(folder) {
    for (const name of await fs.readdir(folder)) {
      const candidate = path.join(folder, name);
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) {
        if (allowApplications && folder === directory && name === 'Applications' && await fs.readlink(candidate) === '/Applications') continue;
        fail('Symlink in artifact app discovery');
      }
      if (name.endsWith('.app')) {
        await safePath(directory, candidate, 'directory');
        apps.push(candidate);
      } else if (stat.isDirectory()) await visit(candidate);
      else await safePath(directory, candidate);
    }
  }
  await visit(directory);
  if (apps.length !== 1) fail('Expected exactly one real app in artifact');
  return apps[0];
}

export async function runSignedArtifactSmoke(options = {}, dependencies = {}) {
  const root = dependencies.root ?? defaultRoot;
  const env = dependencies.env ?? process.env;
  const command = dependencies.command ?? executeCommand;
  const runtimeSmoke = dependencies.runtimeSmoke ?? runPackagedAppSmoke;
  const ctx = { ...dependencies, root, env, command };
  if (typeof options.manifest !== 'string' || !path.isAbsolute(options.manifest) || path.resolve(options.manifest) !== options.manifest) fail('Canonical explicit manifest required');
  const { manifest, manifestPath } = await loadManifest(options.manifest, ctx);
  finalizedBindings(manifest, manifestPath);
  const credentials = validateCredentials(env, dependencies.platform ?? process.platform, dependencies.arch ?? process.arch);
  for (const [key, value] of Object.entries(credentials)) equal(manifest[key], value, `Credential ${key}`);

  async function result(executable, args) {
    return command(executable, args, { cwd: root, env, timeout: 120000 });
  }
  function checked(response, executable) {
    if (response.code !== 0 || response.signal || response.timedOut) fail(`Command failed: ${executable}`);
    return `${response.stdout ?? ''}${response.stderr ?? ''}`;
  }
  async function run(executable, args) { return checked(await result(executable, args), executable); }
  async function json(executable, args) {
    const response = await result(executable, args);
    checked(response, executable);
    try {
      const parsed = JSON.parse(response.stdout);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('Invalid JSON object');
      return parsed;
    } catch { fail('Malformed notarytool result'); }
  }
  async function preserveApp() {
    const seal = await sealApp(manifest.appPath);
    equal(seal.sha256, manifest.appSealSha256, 'Source app seal');
    equal(JSON.stringify(seal.files), JSON.stringify(manifest.appFiles), 'Source app files');
  }
  async function artifacts() {
    for (const name of ['appZip', 'zip', 'dmg']) {
      const artifact = manifest.artifacts[name];
      await safePath(manifest.runDirectory, artifact.path);
      equal(await sha256File(artifact.path), artifact.sha256, `${name} final hash`);
    }
  }
  async function appProof(app, scope = manifest.runDirectory) {
    const seal = await validateApp(app, { ...manifest, runDirectory: scope }, ctx);
    equal(seal.sha256, manifest.appSealSha256, 'Artifact app seal');
    equal(JSON.stringify(seal.files), JSON.stringify(manifest.appFiles), 'Artifact app files');
    await verifyGatekeeper(app, 'app', ctx);
    await run('xcrun', ['stapler', 'validate', app]);
  }

  await preserveApp();
  try {
    await artifacts();
    const sourceProof = await verifyArtifactSource(manifest, ctx);
    await appProof(manifest.appPath);
    for (const target of ['app', 'dmg']) {
      const record = manifest.notarization[target];
      const args = ['--keychain-profile', manifest.keychainProfile, ...(manifest.keychain ? ['--keychain', manifest.keychain] : [])];
      const info = await json('xcrun', ['notarytool', 'info', record.id, '--output-format', 'json', ...args]);
      equal(info.id, record.id, 'Apple info ID');
      equal(info.status, 'Accepted', 'Apple info status');
      const log = await json('xcrun', ['notarytool', 'log', record.id, ...args]);
      equal(log.jobId, record.id, 'Apple log ID');
      equal(log.status, 'Accepted', 'Apple log status');
      if (typeof log.sha256 !== 'string' || !hash.test(log.sha256.toLowerCase())) fail('Missing Apple uploaded SHA');
      equal(log.sha256.toLowerCase(), record.approval.artifactSha256, 'Apple uploaded SHA');
    }
    const dmg = manifest.artifacts.dmg.path;
    await run('codesign', ['--verify', '--strict', dmg]);
    const signature = await run('codesign', ['-d', '--verbose=4', dmg]);
    if (!signature.split(/\r?\n/).includes(`Authority=${manifest.identity}`) || !signature.split(/\r?\n/).includes(`TeamIdentifier=${manifest.teamId}`) || signature.includes('Signature=adhoc')) fail('DMG signature identity/team mismatch');
    await verifyGatekeeper(dmg, 'dmg', ctx);
    await run('xcrun', ['stapler', 'validate', dmg]);

    const extraction = await fs.mkdtemp(path.join(manifest.runDirectory, '.signed-smoke-zip-'));
    try {
      await safePath(manifest.runDirectory, extraction, 'directory');
      await run('/usr/bin/ditto', ['-x', '-k', manifest.artifacts.zip.path, extraction]);
      await appProof(await discoverApp(extraction), extraction);
    } finally { await fs.rm(extraction, { recursive: true, force: true }); }

    const mountOwner = await fs.mkdtemp(path.join(manifest.runDirectory, '.signed-smoke-dmg-'));
    const mountpoint = path.join(mountOwner, 'volume');
    let mounted = false;
    try {
      await fs.mkdir(mountpoint);
      await safePath(manifest.runDirectory, mountpoint, 'directory');
      const response = await result('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountpoint, dmg]);
      // An interrupted attach can still have mounted our volume; recover only our exact mountpoint.
      mounted = String(response.stdout ?? '').split(/\r?\n/).some(line => {
        const fields = line.split('\t').map(field => field.trim()).filter(Boolean);
        return /^\/dev\/disk\d+(s\d+)*$/.test(fields[0] ?? '') && fields.at(-1) === mountpoint;
      });
      checked(response, 'hdiutil attach');
      if (!mounted) fail('Missing owned DMG mount proof');
      await safePath(mountOwner, mountpoint, 'directory');
      await appProof(await discoverApp(mountpoint, true), mountOwner);
    } finally {
      // Never delete a still-mounted tree when detachment fails.
      if (!mounted) {
        // attach can time out after mounting without returning its mount line.
        // A failed ownership probe leaves the tree intact rather than deleting it.
        await safePath(manifest.runDirectory, mountOwner, 'directory');
        const infoPath = path.join(mountOwner, '.mount-info.plist');
        const info = await run('hdiutil', ['info', '-plist']);
        await fs.writeFile(infoPath, info, { flag: 'wx', mode: 0o600 });
        const volumes = await json('plutil', ['-convert', 'json', '-o', '-', infoPath]);
        if (!Array.isArray(volumes.images)) fail('Missing mount ownership information');
        for (const image of volumes.images) {
          if (!Array.isArray(image['system-entities'])) fail('Malformed mount ownership information');
          for (const entity of image['system-entities']) {
            if (entity['mount-point'] !== mountpoint) continue;
            if (image['image-path'] !== dmg || !/^\/dev\/disk\d+(s\d+)*$/.test(entity['dev-entry'] ?? '')) fail('Owned mount source mismatch');
            mounted = true;
          }
        }
      }
      if (mounted) await run('hdiutil', ['detach', mountpoint]);
      await fs.rm(mountOwner, { recursive: true, force: true });
    }
    const runtime = await runtimeSmoke({ appPath: manifest.appPath, evidencePrefix: 'task-31-signed-dist', artifactMode: 'signed' });
    if (runtime?.ok !== true || runtime.artifactMode !== 'signed' || runtime.sourceUnchanged !== true || runtime.sourceSealSha256 !== manifest.appSealSha256) fail('Missing signature-preserving signed runtime receipt');
    const success = runtime.success;
    const proof = success?.signatureProof;
    if (success?.artifactMode !== 'signed' || success.guardUsed !== false ||
        proof?.sourceSealSha256 !== manifest.appSealSha256 || proof.copySealSha256 !== manifest.appSealSha256 ||
        !proof.codesign || !proof.stapler ||
        !commandSucceeded(proof.codesign) || !commandSucceeded(proof.stapler)) fail('Signed startup did not preserve verified bundle signature/ticket');
    if (success.helperHealth?.ok !== true || success.helperHealth.data?.helperVersion !== manifest.version ||
        !Array.isArray(success.servers) || success.servers.length !== 1 || success.servers[0].enabled !== false ||
        success.isolatedCopyRemoved !== true) fail('Missing actual signed helper/UI/isolated cleanup proof');
    const fault = runtime.failure;
    if (fault?.artifactMode !== 'signed' || fault.isolatedCopyRemoved !== true ||
        fault.signatureBefore?.copySealSha256 !== manifest.appSealSha256 ||
        !fault.signatureBefore.codesign || !fault.signatureBefore.stapler ||
        !commandSucceeded(fault.signatureBefore.codesign) || !commandSucceeded(fault.signatureBefore.stapler)) fail('Missing isolated signed fault baseline');
    if (fault.faultClass === 'backend-error') {
      if (fault.bridgeError?.ok !== false || fault.bridgeError.error?.layer !== 'helper_contract' ||
          !/^helper_(spawn_failed|runner_error)$/.test(fault.bridgeError.error?.type ?? '') ||
          !/permission denied|EACCES|failed to spawn helper|spawn .*gpuwatcher-helper/i.test(fault.errorBody ?? '') ||
          !fault.navigableBody?.includes('Save server')) fail('Missing signed backend fault/UI proof');
    } else if (fault.faultClass !== 'os-signature-block' || classifyPackagedFault(fault) !== 'os-signature-block') {
      fail('Unresolved signed fault is not backend or confirmed OS-policy evidence');
    }
    await artifacts();
    const finalSourceProof = await verifyArtifactSource(manifest, ctx);
    equal(JSON.stringify(finalSourceProof), JSON.stringify(sourceProof), 'Product source proof during verification');
    return { manifestPath, appPath: manifest.appPath, state: 'verified', evidencePrefix: 'task-31-signed-dist', sourceProof, runtime };
  } finally { await preserveApp(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runSignedArtifactSmoke(parseCli(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
