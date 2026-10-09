import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVED_PLAN_OID = '810089769e8a1ea1dcbd8476bf250ab8b3eb94d9';
export const REPOSITORY = Object.freeze({ host: 'github.com', repository: 'jinzer0/GPUWatch', repository_id: 1256824919, issue_number: 31 });
export const ACTIONS = Object.freeze(['build', 'prepare-app', 'submit-app', 'package', 'prepare-dmg', 'submit-dmg']);
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = 'mydocs/plans/task_m001_31_impl.md';
const HASH = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };
const inside = (parent, child) => child !== parent && !path.relative(parent, child).startsWith(`..${path.sep}`) && path.relative(parent, child) !== '..' && !path.isAbsolute(path.relative(parent, child));

export function validateCredentials(env, platform = process.platform, arch = process.arch) {
  if (platform !== 'darwin' || arch !== 'arm64') fail('Signed release requires darwin/arm64');
  for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_KEYCHAIN', 'CSC_IDENTITY_AUTO_DISCOVERY', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_API_ISSUER_ID', 'APPLE_TEAM_ID']) {
    if (env[name] !== undefined) fail(`Conflicting authentication input: ${name}`);
  }
  for (const name of Object.keys(env)) {
    if (/^APPLE_API_|^APPLE_.*PASSWORD$|^CSC_INSTALLER_(LINK|KEY_PASSWORD)$/.test(name)) fail(`Conflicting authentication input: ${name}`);
  }
  const identity = env.CSC_NAME;
  const teamId = env.GPUWATCHER_SIGNING_TEAM_ID;
  const keychainProfile = env.APPLE_KEYCHAIN_PROFILE;
  if (typeof teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(teamId)) fail('Missing or invalid signing Team ID');
  if (typeof identity !== 'string' || identity !== identity.trim() || !identity.startsWith('Developer ID Application: ') || !identity.endsWith(` (${teamId})`) || identity === `Developer ID Application:  (${teamId})`) fail('Explicit Developer ID Application identity required');
  if (typeof keychainProfile !== 'string' || !keychainProfile.trim() || keychainProfile !== keychainProfile.trim()) fail('Explicit APPLE_KEYCHAIN_PROFILE required');
  const keychain = env.APPLE_KEYCHAIN ?? null;
  if (keychain !== null && (typeof keychain !== 'string' || !keychain.trim() || keychain !== keychain.trim())) fail('Invalid APPLE_KEYCHAIN');
  return { identity, teamId, keychainProfile, keychain };
}

export function executeCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd, env: options.env, timeout: options.timeout ?? 120000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, signal: error?.signal ?? null, timedOut: Boolean(error?.killed), stdout, stderr });
    });
  });
}

async function command(ctx, executable, args, timeout = 120000) {
  const env = executable === 'git' ? { ...ctx.env, GIT_NO_REPLACE_OBJECTS: '1' } : ctx.env;
  const result = await ctx.command(executable, args, { cwd: ctx.root, env, timeout });
  if (result.code !== 0 || result.signal || result.timedOut) fail(`Command failed: ${executable} ${args[0] ?? ''}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

// Reject symlinks in the ownership path, not just at its final component.
export async function safePath(root, candidate, kind = 'file') {
  const base = path.resolve(root);
  const absolute = path.resolve(candidate);
  if (!inside(base, absolute)) fail('Path is outside owned directory');
  if (await fs.realpath(base) !== base) fail('Owned directory is not canonical');
  let current = base;
  for (const part of path.relative(base, absolute).split(path.sep)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) fail('Symlink in owned path');
  }
  const stat = await fs.lstat(absolute);
  if (kind === 'file' && (!stat.isFile() || stat.nlink !== 1)) fail('Expected single-link regular file');
  if (kind === 'directory' && !stat.isDirectory()) fail('Expected directory');
  return absolute;
}

export async function sha256File(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.nlink !== 1) fail('Expected single-link regular artifact');
  return digest(await fs.readFile(file));
}

export async function sealApp(appPath) {
  const root = path.resolve(appPath);
  if (await fs.realpath(root) !== root || !(await fs.lstat(root)).isDirectory()) fail('Unsafe app path');
  const files = [];
  async function walk(directory) {
    for (const name of (await fs.readdir(directory)).sort()) {
      const file = path.join(directory, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) {
        const link = await fs.readlink(file);
        const target = await fs.realpath(file);
        if (path.isAbsolute(link) || !inside(root, target)) fail('App symlink escapes bundle');
        files.push({ path: relative, type: 'symlink', link, mode: stat.mode & 0o777 });
      } else if (stat.isDirectory()) {
        files.push({ path: relative, type: 'directory', mode: stat.mode & 0o777 });
        await walk(file);
      } else if (stat.isFile() && stat.nlink === 1) {
        files.push({ path: relative, type: 'file', mode: stat.mode & 0o777, size: stat.size, sha256: await sha256File(file) });
      } else fail('Unsupported app file type or hard link');
    }
  }
  await walk(root);
  return { files, sha256: digest(JSON.stringify(files)) };
}

function context(dependencies = {}) {
  return { root: path.resolve(dependencies.root ?? DEFAULT_ROOT), env: dependencies.env ?? process.env, platform: dependencies.platform ?? process.platform, arch: dependencies.arch ?? process.arch, command: dependencies.command ?? executeCommand, build: dependencies.build ?? (async (options) => (await import('electron-builder')).build(options)), now: dependencies.now ?? (() => new Date().toISOString()) };
}

async function sourceCommit(ctx) {
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) {
    if (ctx.env[name] !== undefined) fail(`Git repository override forbidden: ${name}`);
  }
  if (await fs.realpath(ctx.root) !== ctx.root || (await command(ctx, 'git', ['rev-parse', '--show-toplevel'])).trim() !== ctx.root) fail('Git repository root mismatch');
  if ((await command(ctx, 'git', ['for-each-ref', '--format=%(refname)', 'refs/replace'])).trim()) fail('Git replacement refs forbidden');
  const oid = (await command(ctx, 'git', ['rev-parse', 'HEAD'])).trim();
  if (!/^[a-f0-9]{40}$/.test(oid)) fail('Invalid source commit');
  if ((await command(ctx, 'git', ['status', '--porcelain', '--untracked-files=normal'])).trim()) fail('Source tree is edited; commit approved product inputs before signing');
  await command(ctx, 'git', ['merge-base', '--is-ancestor', APPROVED_PLAN_OID, 'HEAD']);
  const planFiles = (await command(ctx, 'git', ['diff-tree', '--no-commit-id', '--name-only', '-r', APPROVED_PLAN_OID])).trim();
  if (planFiles !== PLAN) fail('Approved plan commit changed unexpected files');
  const plan = await safePath(ctx.root, path.join(ctx.root, PLAN));
  const stat = await fs.lstat(plan);
  if ((stat.mode & 0o777) !== 0o644) fail('Approved plan mode changed');
  const approved = await command(ctx, 'git', ['show', `${APPROVED_PLAN_OID}:${PLAN}`]);
  if (digest(await fs.readFile(plan)) !== digest(approved)) fail('Approved plan content changed');
  const approvedTree = (await command(ctx, 'git', ['ls-tree', APPROVED_PLAN_OID, '--', PLAN])).trim();
  const headTree = (await command(ctx, 'git', ['ls-tree', 'HEAD', '--', PLAN])).trim();
  const treeMatch = /^100644 blob ([a-f0-9]{40})\t/.exec(approvedTree);
  if (!treeMatch || approvedTree !== `100644 blob ${treeMatch[1]}\t${PLAN}` || headTree !== approvedTree) fail('Approved plan HEAD mode/blob changed');
  const metadata = (await command(ctx, 'git', ['ls-files', '--stage', '--', PLAN])).trim();
  if (metadata !== `100644 ${treeMatch[1]} 0\t${PLAN}`) fail('Approved plan index mode/blob changed');
  return oid;
}

async function assertSource(ctx, manifest) {
  if (await sourceCommit(ctx) !== manifest.sourceCommit) fail('Source commit drift');
  const credentials = validateCredentials(ctx.env, ctx.platform, ctx.arch);
  for (const [key, value] of Object.entries(credentials)) if (manifest[key] !== value) fail(`Manifest credential binding drift: ${key}`);
  await certificateIdentity(ctx, credentials);
}

async function certificateIdentity(ctx, credentials) {
  const output = await command(ctx, 'security', ['find-identity', '-v', '-p', 'codesigning', ...(credentials.keychain ? [credentials.keychain] : [])]);
  const matches = [...output.matchAll(/^\s*\d+\)\s+([a-f0-9]{40})\s+"([^"]+)"\s*$/gim)].filter((match) => match[2] === credentials.identity);
  if (matches.length !== 1) fail('Expected exactly one valid Developer ID certificate matching identity/team');
  return matches[0][1];
}

function signatureDetails(text, manifest, runtime = true) {
  if (!text.includes(`Authority=${manifest.identity}`) || !text.includes(`TeamIdentifier=${manifest.teamId}`) || /Signature=adhoc/.test(text)) fail('Signature identity/team mismatch');
  if (runtime && !/flags=.*\bruntime\b/.test(text)) fail('Hardened runtime missing');
}

function validateEntitlements(text, helper) {
  const keys = [...text.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
  if (!/<(?:plist|dict)[\s>\/]/.test(text)) fail('Missing entitlement plist');
  if (helper ? keys.length !== 0 : keys.length !== 1 || keys[0] !== 'com.apple.security.cs.allow-jit' || !/<true\s*\/>/.test(text)) fail('Unexpected signing entitlements');
}

export async function verifyGatekeeper(file, type, dependencies = {}) {
  if (type !== 'app' && type !== 'dmg') fail('Unsupported Gatekeeper artifact type');
  const ctx = context(dependencies);
  const args = type === 'app'
    ? ['--assess', '--verbose=4', '--type', 'execute', file]
    : ['--assess', '--verbose=4', '--type', 'open', '--context', 'context:primary-signature', file];
  const result = await command(ctx, 'spctl', args);
  if (!/(?:^|\n)[^\n]*: accepted\r?(?:\n|$)/.test(result) ||
      !/(?:^|\n)source=Notarized Developer ID\r?(?:\n|$)/.test(result) ||
      /assessments (?:are )?disabled/i.test(result)) fail('Gatekeeper did not accept a notarized Developer ID artifact');
  return result;
}

export async function validateApp(appPath, manifest, dependencies = {}) {
  const ctx = context(dependencies);
  await safePath(manifest.runDirectory, appPath, 'directory');
  await command(ctx, 'codesign', ['--verify', '--deep', '--strict', appPath]);
  const info = path.join(appPath, 'Contents/Info.plist');
  await safePath(appPath, info);
  const version = (await command(ctx, '/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', info])).trim();
  if (version !== manifest.version || version !== '0.2.0') fail('App version mismatch');
  const executableName = (await command(ctx, '/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', info])).trim();
  if (!executableName || path.basename(executableName) !== executableName) fail('Unsafe bundle executable name');
  const executable = path.join(appPath, 'Contents/MacOS', executableName);
  const helper = path.join(appPath, 'Contents/Resources/gpuwatcher-helper/gpuwatcher-helper');
  for (const file of [executable, helper]) {
    await safePath(appPath, file);
    if (!((await fs.lstat(file)).mode & 0o111)) fail('Packaged binary is not executable');
    if ((await command(ctx, 'lipo', ['-archs', file])).trim() !== 'arm64') fail('Packaged binary architecture mismatch');
  }
  for (const target of [appPath, helper]) {
    await command(ctx, 'codesign', ['--verify', '--strict', target]);
    signatureDetails(await command(ctx, 'codesign', ['-d', '--verbose=4', target]), manifest);
    validateEntitlements(await command(ctx, 'codesign', ['-d', '--entitlements', ':-', target]), target === helper);
  }
  return sealApp(appPath);
}

async function discover(directory, suffix) {
  const matches = [];
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) fail('Symlink in output discovery');
      if (entry.name.endsWith(suffix)) matches.push(file);
      else if (entry.isDirectory()) await walk(file);
    }
  }
  await walk(directory);
  if (matches.length !== 1) fail(`Expected exactly one ${suffix} candidate`);
  return matches[0];
}

export async function loadManifest(manifestPath, dependencies = {}) {
  const ctx = context(dependencies);
  if (typeof manifestPath !== 'string' || !manifestPath) fail('Explicit manifest required');
  const signedRoot = path.join(ctx.root, 'release/electron/signed');
  const file = await safePath(ctx.root, path.resolve(manifestPath));
  if (!inside(signedRoot, file) || path.basename(file) !== 'manifest.json') fail('Manifest outside signed run');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.approvedPlanOid !== APPROVED_PLAN_OID || manifest.version !== '0.2.0' || manifest.arch !== 'arm64' || manifest.runDirectory !== path.dirname(file) || path.dirname(manifest.runDirectory) !== signedRoot) fail('Invalid manifest provenance');
  for (const [key, value] of Object.entries(REPOSITORY)) if (manifest[key] !== value) fail('Manifest repository binding mismatch');
  await safePath(ctx.root, manifest.runDirectory, 'directory');
  if (await safePath(manifest.runDirectory, manifest.appPath, 'directory') !== manifest.appPath) fail('App path is not canonical');
  for (const artifact of Object.values(manifest.artifacts ?? {})) {
    if (await safePath(manifest.runDirectory, artifact.path) !== artifact.path) fail('Artifact path is not canonical');
  }
  return { manifest, manifestPath: file };
}

async function saveManifest(file, manifest, ctx) {
  manifest.updatedAt = ctx.now();
  const temporary = path.join(path.dirname(file), `.manifest-${randomUUID()}.json`);
  await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, file);
}

async function assertSeal(manifest) {
  const seal = await sealApp(manifest.appPath);
  if (seal.sha256 !== manifest.appSealSha256 || digest(JSON.stringify(manifest.appFiles)) !== seal.sha256) fail('App seal drift');
  return seal;
}

async function artifactRecord(run, file, status) {
  await safePath(run, file);
  return { path: file, sha256: await sha256File(file), status };
}

async function assertArtifact(manifest, name) {
  const artifact = manifest.artifacts[name];
  if (!artifact || !HASH.test(artifact.sha256)) fail('Missing artifact record');
  await safePath(manifest.runDirectory, artifact.path);
  if (await sha256File(artifact.path) !== artifact.sha256) fail('Artifact hash drift');
  return artifact;
}

export async function approvalInputs(action, manifestPath, dependencies = {}) {
  if (!['submit-app', 'submit-dmg'].includes(action)) fail('Invalid approval action');
  const ctx = context(dependencies);
  const { manifest, manifestPath: file } = await loadManifest(manifestPath, ctx);
  await assertSource(ctx, manifest);
  await assertSeal(manifest);
  for (const name of Object.keys(manifest.artifacts)) await assertArtifact(manifest, name);
  const name = action === 'submit-app' ? 'appZip' : 'dmg';
  const artifact = await assertArtifact(manifest, name);
  const expected = action === 'submit-app' ? 'app-prepared' : 'dmg-prepared';
  if (manifest.state !== expected || manifest.notarization[action === 'submit-app' ? 'app' : 'dmg']) fail('Submission state is not fresh');
  return { ...REPOSITORY, action: action === 'submit-app' ? 'submit-app-zip-and-staple-app' : 'submit-dmg-and-staple-dmg', target: 'Apple notarization service', approvedPlanOid: APPROVED_PLAN_OID, sourceCommit: manifest.sourceCommit, version: manifest.version, arch: manifest.arch, identity: manifest.identity, teamId: manifest.teamId, keychain: manifest.keychain, keychainProfile: manifest.keychainProfile, manifestPath: file, manifestSha256: await sha256File(file), artifactPath: artifact.path, artifactSha256: artifact.sha256, appSealSha256: manifest.appSealSha256 };
}

function notaryArgs(manifest) {
  return ['--keychain-profile', manifest.keychainProfile, ...(manifest.keychain ? ['--keychain', manifest.keychain] : [])];
}

function parseResponse(result) {
  try { return JSON.parse(result.stdout); } catch { fail('Malformed notarytool JSON'); }
}

async function submit(action, file, manifest, options, ctx) {
  const approval = await approvalInputs(action, file, ctx);
  if (!HASH.test(options.approvedManifestSha256 ?? '') || !HASH.test(options.approvedArtifactSha256 ?? '') || options.approvedManifestSha256 !== approval.manifestSha256 || options.approvedArtifactSha256 !== approval.artifactSha256) fail('Explicit approval hash mismatch');
  await validateApp(manifest.appPath, manifest, ctx);
  // Recheck after all read-only verification, immediately before the one upload.
  const current = await approvalInputs(action, file, ctx);
  if (JSON.stringify(current) !== JSON.stringify(approval)) fail('Approval bindings changed during verification');
  const target = action === 'submit-app' ? 'app' : 'dmg';
  const artifactName = target === 'app' ? 'appZip' : 'dmg';
  const artifact = manifest.artifacts[artifactName];
  manifest.notarization[target] = { status: 'Submitting', approval, attemptedAt: ctx.now() };
  manifest.state = `${target}-submitting`;
  await saveManifest(file, manifest, ctx);
  try {
    await assertSource(ctx, manifest);
    await assertSeal(manifest);
    await assertArtifact(manifest, artifactName);
    const result = await ctx.command('xcrun', ['notarytool', 'submit', artifact.path, '--wait', '--output-format', 'json', ...notaryArgs(manifest)], { cwd: ctx.root, env: ctx.env, timeout: 1800000 });
    manifest.notarization[target].exitCode = result.code;
    manifest.notarization[target].signal = result.signal ?? null;
    manifest.notarization[target].timedOut = Boolean(result.timedOut);
    let response;
    try { response = parseResponse(result); } catch (error) {
      const recovered = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.match(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i)?.[0];
      if (recovered) manifest.notarization[target].id = recovered;
      throw error;
    }
    if (typeof response.id === 'string' && REQUEST_ID.test(response.id)) manifest.notarization[target].id = response.id;
    manifest.notarization[target].submissionStatus = response.status ?? null;
    manifest.notarization[target].submissionResponse = response;
    await saveManifest(file, manifest, ctx);
    if (!manifest.notarization[target].id) fail('Missing notarytool request ID');
    if (result.code !== 0 || result.signal || result.timedOut) fail('Notarytool submit failed or timed out; do not resubmit');
    if (response.status !== 'Accepted') fail('Notarization not Accepted');
    const infoResult = await ctx.command('xcrun', ['notarytool', 'info', response.id, '--output-format', 'json', ...notaryArgs(manifest)], { cwd: ctx.root, env: ctx.env, timeout: 120000 });
    const info = parseResponse(infoResult);
    if (infoResult.code !== 0 || infoResult.signal || infoResult.timedOut || info.id !== response.id || info.status !== 'Accepted') fail('Notarytool info ID/status mismatch');
    manifest.notarization[target].infoId = info.id;
    manifest.notarization[target].infoStatus = info.status;
    manifest.notarization[target].infoResponse = info;
    const logResult = await ctx.command('xcrun', ['notarytool', 'log', response.id, ...notaryArgs(manifest)], { cwd: ctx.root, env: ctx.env, timeout: 120000 });
    const log = parseResponse(logResult);
    if (logResult.code !== 0 || logResult.signal || logResult.timedOut || log.jobId !== response.id || log.status !== 'Accepted' || log.sha256?.toLowerCase() !== approval.artifactSha256) fail('Notarytool log job/artifact binding mismatch');
    manifest.notarization[target].logJobId = log.jobId;
    manifest.notarization[target].logSha256 = log.sha256.toLowerCase();
    manifest.notarization[target].logResponse = log;
    manifest.notarization[target].status = 'Accepted';
    manifest.notarization[target].acceptedAt = ctx.now();
    await saveManifest(file, manifest, ctx);
    await assertSeal(manifest);
    await assertArtifact(manifest, artifactName);
    const staplePath = target === 'app' ? manifest.appPath : artifact.path;
    const before = target === 'app' ? manifest.appSealSha256 : artifact.sha256;
    await command(ctx, 'xcrun', ['stapler', 'staple', staplePath]);
    await command(ctx, 'xcrun', ['stapler', 'validate', staplePath]);
    await verifyGatekeeper(staplePath, target, ctx);
    if (target === 'app') {
      const seal = await validateApp(manifest.appPath, manifest, ctx);
      manifest.appSealSha256 = seal.sha256;
      manifest.appFiles = seal.files;
      manifest.appStaple = { beforeSha256: before, afterSha256: seal.sha256, validatedAt: ctx.now() };
      manifest.state = 'app-stapled';
    } else {
      await verifyDmg(artifact.path, manifest, ctx);
      await assertSeal(manifest);
      await assertArtifact(manifest, 'zip');
      const after = await sha256File(artifact.path);
      manifest.dmgStaple = { beforeSha256: before, afterSha256: after, validatedAt: ctx.now() };
      artifact.submissionSha256 = before;
      artifact.sha256 = after;
      artifact.status = 'stapled';
      manifest.state = 'finalized';
    }
    manifest.notarization[target].status = 'Accepted-and-stapled';
    await saveManifest(file, manifest, ctx);
    return { manifestPath: file, manifest };
  } catch (error) {
    const record = manifest.notarization[target];
    record.status = record.status === 'Accepted' ? 'Accepted-verification-failed' : 'Failed-or-uncertain';
    // Timeout recovery is read-only; never turn uncertainty into a second submit.
    if (record.id && record.status === 'Failed-or-uncertain') {
      try {
        const infoResult = await ctx.command('xcrun', ['notarytool', 'info', record.id, '--output-format', 'json', ...notaryArgs(manifest)], { cwd: ctx.root, env: ctx.env, timeout: 120000 });
        const info = parseResponse(infoResult);
        if (infoResult.code === 0 && !infoResult.signal && !infoResult.timedOut && info.id === record.id) record.recoveredStatus = info.status ?? null;
      } catch { /* Preserve the submission ID even when read-only recovery fails. */ }
    }
    manifest.state = `${target}-failed`;
    await saveManifest(file, manifest, ctx);
    throw error;
  }
}

async function verifyDmg(file, manifest, ctx) {
  await safePath(manifest.runDirectory, file);
  await command(ctx, 'codesign', ['--verify', '--strict', file]);
  signatureDetails(await command(ctx, 'codesign', ['-d', '--verbose=4', file]), manifest, false);
}

async function verifyZip(file, manifest, ctx) {
  const extraction = await fs.mkdtemp(path.join(manifest.runDirectory, '.zip-verification-'));
  try {
    await command(ctx, '/usr/bin/ditto', ['-x', '-k', file, extraction]);
    const app = await discover(extraction, '.app');
    const seal = await validateApp(app, manifest, ctx);
    if (seal.sha256 !== manifest.appSealSha256) fail('ZIP does not contain the sealed app');
  } finally {
    await fs.rm(extraction, { recursive: true, force: true });
  }
}

export async function runAction(action, options = {}, dependencies = {}) {
  if (!ACTIONS.includes(action)) fail('Unsupported signed release action');
  const ctx = context(dependencies);
  const credentials = validateCredentials(ctx.env, ctx.platform, ctx.arch);
  if (action === 'build') {
    if (options.manifest) fail('Build creates a fresh run; manifest is not accepted');
    const commit = await sourceCommit(ctx);
    const certificateHash = await certificateIdentity(ctx, credentials);
    const metadata = JSON.parse(await fs.readFile(await safePath(ctx.root, path.join(ctx.root, 'package.json')), 'utf8'));
    if (metadata.version !== '0.2.0') fail('Signed release requires version 0.2.0');
    const signedRoot = path.join(ctx.root, 'release/electron/signed');
    // Validate every existing ancestor before creating output.
    for (const relative of ['release', 'release/electron', 'release/electron/signed']) {
      const directory = path.join(ctx.root, relative);
      try { await safePath(ctx.root, directory, 'directory'); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await fs.mkdir(directory);
        await safePath(ctx.root, directory, 'directory');
      }
    }
    const runDirectory = path.join(signedRoot, `${ctx.now().replace(/[:.]/g, '-')}-${randomUUID()}`);
    await fs.mkdir(runDirectory, { mode: 0o700 });
    const manifest = { schemaVersion: 1, ...REPOSITORY, approvedPlanOid: APPROVED_PLAN_OID, sourceCommit: commit, version: '0.2.0', arch: 'arm64', ...credentials, runDirectory, appPath: null, appFiles: [], appSealSha256: null, artifacts: {}, notarization: {}, state: 'building', createdAt: ctx.now() };
    const file = path.join(runDirectory, 'manifest.json');
    await saveManifest(file, manifest, ctx);
    try {
    await ctx.build({ projectDir: ctx.root, mac: ['dir'], arm64: true, publish: 'never', config: { directories: { output: runDirectory }, forceCodeSigning: true, mac: { target: ['dir'], identity: certificateHash, sign: path.join(ctx.root, 'electron/signPackagedApp.mjs'), binaries: ['Contents/Resources/gpuwatcher-helper/gpuwatcher-helper'], hardenedRuntime: true, notarize: false, entitlements: path.join(ctx.root, 'build/entitlements.mac.plist'), entitlementsInherit: path.join(ctx.root, 'build/entitlements.mac.plist') } } });
    manifest.appPath = await discover(runDirectory, '.app');
    const seal = await validateApp(manifest.appPath, manifest, ctx);
    manifest.appFiles = seal.files;
    manifest.appSealSha256 = seal.sha256;
    manifest.signedAppSealSha256 = seal.sha256;
    manifest.state = 'signed';
    await assertSource(ctx, manifest);
    await saveManifest(file, manifest, ctx);
    return { manifestPath: file, manifest };
    } catch (error) {
      manifest.state = 'build-failed';
      await saveManifest(file, manifest, ctx);
      throw error;
    }
  }
  const { manifest, manifestPath: file } = await loadManifest(options.manifest, ctx);
  await assertSource(ctx, manifest);
  await assertSeal(manifest);
  if (action === 'submit-app' || action === 'submit-dmg') return submit(action, file, manifest, options, ctx);
  if (action === 'prepare-app') {
    if (!['signed', 'app-prepared'].includes(manifest.state)) fail('App preparation requires fresh signed app');
    await validateApp(manifest.appPath, manifest, ctx);
    if (manifest.state === 'signed') {
      const zip = path.join(manifest.runDirectory, 'app-submission.zip');
      try { await fs.lstat(zip); fail('Submission ZIP already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await command(ctx, '/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', manifest.appPath, zip]);
      await assertSeal(manifest);
      await verifyZip(zip, manifest, ctx);
      manifest.artifacts.appZip = await artifactRecord(manifest.runDirectory, zip, 'frozen-for-submission');
      manifest.state = 'app-prepared';
      await saveManifest(file, manifest, ctx);
    }
    return { manifestPath: file, manifest, approval: await approvalInputs('submit-app', file, ctx) };
  }
  if (action === 'package') {
    if (manifest.state !== 'app-stapled' || manifest.notarization.app?.status !== 'Accepted-and-stapled') fail('Packaging requires Accepted stapled app');
    await validateApp(manifest.appPath, manifest, ctx);
    await command(ctx, 'xcrun', ['stapler', 'validate', manifest.appPath]);
    await verifyGatekeeper(manifest.appPath, 'app', ctx);
    const output = path.join(manifest.runDirectory, 'distribution');
    await fs.mkdir(output, { mode: 0o700 });
    const before = await assertSeal(manifest);
    try {
      const certificateHash = await certificateIdentity(ctx, credentials);
      await ctx.build({ projectDir: ctx.root, prepackaged: manifest.appPath, mac: ['dmg'], arm64: true, publish: 'never', config: { directories: { output }, forceCodeSigning: true, mac: { target: ['dmg'], identity: certificateHash, sign: path.join(ctx.root, 'electron/signPackagedApp.mjs'), hardenedRuntime: true, notarize: false }, dmg: { sign: true } } });
      await assertSeal(manifest);
      const dmg = await discover(output, '.dmg');
      await verifyDmg(dmg, manifest, ctx);
      const zip = path.join(output, 'GPUWatcher-0.2.0-arm64.zip');
      await command(ctx, '/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', manifest.appPath, zip]);
      if ((await sealApp(manifest.appPath)).sha256 !== before.sha256) fail('Packaging changed source app');
      await verifyZip(zip, manifest, ctx);
      manifest.artifacts.zip = await artifactRecord(manifest.runDirectory, zip, 'from-stapled-app');
      manifest.artifacts.dmg = await artifactRecord(manifest.runDirectory, dmg, 'signed');
      manifest.state = 'packaged';
      await assertSource(ctx, manifest);
      await saveManifest(file, manifest, ctx);
      return { manifestPath: file, manifest };
    } catch (error) {
      manifest.state = 'package-failed';
      await saveManifest(file, manifest, ctx);
      throw error;
    }
  }
  if (action === 'prepare-dmg') {
    if (!['packaged', 'dmg-prepared'].includes(manifest.state)) fail('DMG preparation requires packaged artifacts');
    const dmg = await assertArtifact(manifest, 'dmg');
    await assertArtifact(manifest, 'zip');
    await verifyDmg(dmg.path, manifest, ctx);
    if (manifest.state === 'packaged') {
      manifest.state = 'dmg-prepared';
      manifest.artifacts.dmg.status = 'frozen-for-submission';
      await saveManifest(file, manifest, ctx);
    }
    return { manifestPath: file, manifest, approval: await approvalInputs('submit-dmg', file, ctx) };
  }
  fail('Unsupported signed release action');
}

export function parseCli(argv) {
  const [action, ...args] = argv;
  if (!ACTIONS.includes(action)) fail('Expected fixed signed release action');
  const names = { '--manifest': 'manifest', '--approved-manifest-sha256': 'approvedManifestSha256', '--approved-artifact-sha256': 'approvedArtifactSha256' };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = names[args[index]];
    const value = args[index + 1];
    if (!key || !value || value.startsWith('--') || options[key]) fail('Invalid or duplicate CLI option');
    options[key] = value;
  }
  if (action !== 'build' && !options.manifest) fail('Explicit --manifest required');
  if (!action.startsWith('submit-') && (options.approvedManifestSha256 || options.approvedArtifactSha256)) fail('Approval hashes only apply to submit');
  if (action.startsWith('submit-') && (!HASH.test(options.approvedManifestSha256 ?? '') || !HASH.test(options.approvedArtifactSha256 ?? ''))) fail('Explicit approval SHA-256 inputs required');
  return { action, options };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { action, options } = parseCli(process.argv.slice(2));
    console.log(JSON.stringify(await runAction(action, options), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
