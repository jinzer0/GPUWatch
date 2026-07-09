#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { helperPathForApp, releaseElectronRoot, walk } from './shared/paths.mjs';

const commandTimeoutMs = 120000;

function timestamp() {
  return new Date().toISOString();
}

function requireStartedAt() {
  const raw = process.env.GPUWATCHER_ARTIFACT_STARTED_AT_MS;
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`GPUWATCHER_ARTIFACT_STARTED_AT_MS must be a finite number, got ${raw}`);
  }
  return value;
}

function commandResult(name, args, cwd) {
  return new Promise((resolve) => {
    const child = execFile(name, args, { cwd, timeout: commandTimeoutMs }, (error, stdout, stderr) => {
      resolve({
        command: [name, ...args].join(' '),
        exitCode: error?.code ?? 0,
        signal: error?.signal,
        stdout,
        stderr
      });
    });
    child.on('error', (error) => {
      resolve({ command: [name, ...args].join(' '), exitCode: 127, signal: undefined, stdout: '', stderr: error.message });
    });
  });
}

function assertCommandSucceeded(result) {
  if (result.exitCode !== 0 || result.signal) {
    throw new Error(`${result.command} failed with exitCode=${result.exitCode} signal=${result.signal ?? 'none'}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function assertUnsignedCodesign(result, appPath) {
  const output = `${result.stdout}\n${result.stderr}`;
  const explicitlyUnsigned = /code object is not signed at all|invalid signature|not signed|Signature=adhoc/i.test(output);
  const hasDeveloperId = /Authority=Developer ID Application/.test(output);
  const hasRealTeamIdentifier = /TeamIdentifier=(?!not set\b).+/i.test(output);
  if (!explicitlyUnsigned && (hasDeveloperId || hasRealTeamIdentifier)) {
    throw new Error(`Expected unsigned codesign output for ${appPath}, got:\n${output}`);
  }
}

async function artifactRecords(releaseRoot, startedAtMs) {
  let entries;
  try {
    entries = await walk(releaseRoot);
  } catch (error) {
    throw new Error(`Expected unsigned artifacts under ${releaseRoot}, but release directory could not be read: ${error.message}`);
  }

  const candidates = entries.filter((entry) => {
    const name = path.basename(entry);
    return /^GPUWatcher.*\.(dmg|zip)$/.test(name);
  });
  const records = [];
  for (const candidate of candidates) {
    const details = await stat(candidate);
    if (!details.isFile()) {
      throw new Error(`Unsigned artifact candidate must be a file, got directory or special file: ${candidate}`);
    }
    if (details.size <= 0) {
      throw new Error(`Unsigned artifact is empty: ${candidate}`);
    }
    if (startedAtMs !== undefined && details.mtimeMs < startedAtMs) {
      throw new Error(`Unsigned artifact is stale: ${candidate} mtimeMs=${details.mtimeMs} startedAtMs=${startedAtMs}`);
    }
    records.push({ path: candidate, size: details.size, mtimeMs: details.mtimeMs, ext: path.extname(candidate).slice(1) });
  }

  const dmgs = records.filter((record) => record.ext === 'dmg');
  const zips = records.filter((record) => record.ext === 'zip');
  if (dmgs.length === 0 || zips.length === 0) {
    throw new Error(`Expected at least one current GPUWatcher*.dmg and one GPUWatcher*.zip under ${releaseRoot}; found dmg=${dmgs.length} zip=${zips.length}`);
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

async function discoverAppIn(directory) {
  const entries = await walk(directory);
  const apps = entries.filter((entry) => entry.endsWith(`${path.sep}GPUWatcher.app`));
  if (apps.length === 0) {
    throw new Error(`Expected GPUWatcher.app under ${directory}, found none.`);
  }
  return apps[0];
}

async function verifyHelper(appPath) {
  const helperPath = helperPathForApp(appPath);
  await access(helperPath, constants.X_OK);
  return helperPath;
}

async function codesignApp(appPath) {
  const result = await commandResult('codesign', ['-dv', '--verbose=4', appPath], undefined);
  assertUnsignedCodesign(result, appPath);
  return result;
}

async function validateZip(record) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-unsigned-zip-'));
  try {
    const extract = await commandResult('ditto', ['-x', '-k', record.path, tempDir], undefined);
    assertCommandSucceeded(extract);
    const appPath = await discoverAppIn(tempDir);
    const helperPath = await verifyHelper(appPath);
    const codesign = await codesignApp(appPath);
    return { type: 'zip', artifactPath: record.path, tempDir, appPath, helperPath, extract, codesign, cleanup: `removed ${tempDir}` };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function mountedVolumeFromAttach(stdout) {
  const lines = stdout.trim().split('\n').reverse();
  for (const line of lines) {
    const match = line.match(/\t(\/Volumes\/.+)$/);
    if (match) {
      return match[1];
    }
  }
  throw new Error(`Could not find mounted /Volumes path in hdiutil output:\n${stdout}`);
}

async function validateDmg(record) {
  let volumePath;
  try {
    const attach = await commandResult('hdiutil', ['attach', '-nobrowse', '-readonly', record.path], undefined);
    assertCommandSucceeded(attach);
    volumePath = mountedVolumeFromAttach(attach.stdout);
    const appPath = path.join(volumePath, 'GPUWatcher.app');
    await stat(appPath);
    const helperPath = await verifyHelper(appPath);
    const codesign = await codesignApp(appPath);
    return { type: 'dmg', artifactPath: record.path, volumePath, appPath, helperPath, attach, codesign, cleanup: `detached ${volumePath}` };
  } finally {
    if (volumePath) {
      const detach = await commandResult('hdiutil', ['detach', volumePath], undefined);
      if (detach.exitCode !== 0) {
        console.error(`Failed to detach ${volumePath}:\n${detach.stdout}\n${detach.stderr}`);
      }
    }
  }
}

function formatCommandOutput(result) {
  return [
    `command: ${result.command}`,
    `exitCode: ${result.exitCode}`,
    `signal: ${result.signal ?? 'none'}`,
    `stdout:\n${result.stdout || '(empty)'}`,
    `stderr:\n${result.stderr || '(empty)'}`
  ].join('\n');
}

function printValidation({ releaseRoot, runStartedAt, startedAtMs, records, validations }) {
  console.log('Unsigned macOS distribution artifact smoke evidence');
  console.log(`Started at: ${runStartedAt}`);
  console.log(`Release root: ${releaseRoot}`);
  console.log(`Started-at validator: ${startedAtMs ?? 'not set'}`);
  console.log(`Artifact count: ${records.length}`);
  for (const record of records) {
    console.log(`Artifact: ${record.path}`);
    console.log(`Artifact size: ${record.size}`);
    console.log(`Artifact mtimeMs: ${record.mtimeMs}`);
  }
  for (const validation of validations) {
    console.log(`${validation.type.toUpperCase()} validation artifact: ${validation.artifactPath}`);
    console.log(`${validation.type.toUpperCase()} app path: ${validation.appPath}`);
    console.log(`${validation.type.toUpperCase()} helper path: ${validation.helperPath}`);
    if (validation.tempDir) {
      console.log(`ZIP temp extraction dir: ${validation.tempDir}`);
      console.log(`ZIP extract result:\n${formatCommandOutput(validation.extract)}`);
    }
    if (validation.volumePath) {
      console.log(`DMG mounted volume: ${validation.volumePath}`);
      console.log(`DMG attach result:\n${formatCommandOutput(validation.attach)}`);
    }
    console.log(`${validation.type.toUpperCase()} codesign output:\n${formatCommandOutput(validation.codesign)}`);
    console.log(`${validation.type.toUpperCase()} cleanup: ${validation.cleanup}`);
  }
  console.log(`Completed at: ${timestamp()}`);
}

async function main() {
  const runStartedAt = timestamp();
  if (process.platform !== 'darwin') {
    throw new Error(`Unsigned macOS artifact smoke requires darwin, got ${process.platform}`);
  }
  const releaseRoot = process.env.GPUWATCHER_RELEASE_DIR ?? releaseElectronRoot();
  const startedAtMs = requireStartedAt();
  const records = await artifactRecords(releaseRoot, startedAtMs);
  const zips = records.filter((record) => record.ext === 'zip');
  const dmgs = records.filter((record) => record.ext === 'dmg');
  const validations = [];
  for (const record of zips) {
    validations.push(await validateZip(record));
  }
  for (const record of dmgs) {
    validations.push(await validateDmg(record));
  }
  printValidation({ releaseRoot, runStartedAt, startedAtMs, records, validations });
}

try {
  await main();
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
