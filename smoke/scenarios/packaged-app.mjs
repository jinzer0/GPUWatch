import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sealApp } from '../../electron/signedRelease.mjs';
import { waitForText } from '../shared/dom.mjs';
import { createProcessSet, timestamp } from '../shared/processes.mjs';
import { appExecutable, discoverAppPath, evidenceDir, helperPathForApp } from '../shared/paths.mjs';
import { buildPackagedEvidence } from './packaged-app/evidence.mjs';
import { runPackagedHelperErrorScenario } from './packaged-app/helper-error.mjs';
import { runPackagedStartupScenario, verifyPackagedRuntimePaths } from './packaged-app/startup.mjs';

const taskEvidenceName = 'task-29-native-macos-ux';
const cdpPortBase = 9349;

function evidencePrefix(options) {
  return options.evidencePrefix ?? (options.artifactMode === 'signed' ? 'task-31-signed-packaged' : taskEvidenceName);
}

async function runScenario(logs, screenshots, spawnLogged, options) {
  await mkdir(evidenceDir, { recursive: true });
  const startedAt = timestamp();
  const appPath = await discoverAppPath(options.appPath);
  const helperPath = helperPathForApp(appPath);
  const executablePath = appExecutable(appPath);
  await verifyPackagedRuntimePaths({ executablePath, helperPath });
  const artifactMode = options.artifactMode ?? 'unsigned';
  const prefix = evidencePrefix(options);
  const packagedWaitForText = (cdp, text, timeoutMs = 30000) => waitForText(cdp, text, { evidenceDir, missingPrefix: prefix, timeoutMs });
  const sourceSeal = artifactMode === 'signed' ? await sealApp(appPath) : null;
  const helperMode = (await stat(helperPath)).mode & 0o777;
  let success;
  let failure;
  try {
    success = await runPackagedStartupScenario({ artifactMode, evidencePrefix: options.evidencePrefix, appPath, helperPath, logs, screenshots, spawnLogged, cdpPort: cdpPortBase, waitForText: packagedWaitForText, timestamp });
    failure = await runPackagedHelperErrorScenario({ artifactMode, evidencePrefix: options.evidencePrefix, appPath, helperPath, logs, screenshots, spawnLogged, cdpPort: cdpPortBase + 1, waitForText: packagedWaitForText, timestamp });
  } finally {
    await access(helperPath, constants.X_OK);
    if (sourceSeal && (await sealApp(appPath)).sha256 !== sourceSeal.sha256) throw new Error('Signed packaged smoke changed source app seal');
  }
  const discovery = options.appPath === undefined ? 'unique unsigned release/electron app discovery (signed namespace excluded)' : 'explicit canonical app path';
  const evidence = await buildPackagedEvidence({ taskEvidenceName: prefix, artifactMode, discovery, sourceUnchanged: sourceSeal ? true : null, startedAt, appPath, helperPath, executablePath, helperMode, success, failure, logs, timestamp });
  await writeFile(path.join(evidenceDir, `${prefix}.txt`), `${evidence.launchEvidence}\n\n${evidence.failureEvidence}\n`);
  await writeFile(path.join(evidenceDir, `${prefix}-helper-resolution-failures.txt`), `${evidence.failureEvidence}\n`);
  await writeFile(path.join(evidenceDir, `${prefix}-packaged-app.log`), logs.join(''));
  console.log(evidence.launchEvidence);
  console.log('');
  console.log(evidence.failureEvidence);
  return { ok: true, artifactMode, success, failure, sourceUnchanged: sourceSeal ? true : null, sourceSealSha256: sourceSeal?.sha256 ?? null };
}

export async function runPackagedAppSmoke(options = {}) {
  const artifactMode = options.artifactMode ?? 'unsigned';
  if (!['signed', 'unsigned'].includes(artifactMode)) throw new Error('Invalid packaged artifact mode');
  if (artifactMode === 'signed' && options.appPath === undefined) throw new Error('Signed packaged smoke requires an explicit canonical app path');
  const prefix = evidencePrefix(options);
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error('Invalid packaged evidence prefix');
  const logs = [];
  const screenshots = [];
  const processSet = createProcessSet();
  try {
    return await runScenario(logs, screenshots, processSet.spawnLogged, options);
  } catch (error) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, `${prefix}-packaged-smoke-failure.txt`), `${error.stack ?? error.message}\n`);
    await writeFile(path.join(evidenceDir, `${prefix}-packaged-app.log`), logs.join(''));
    if (options.appPath !== undefined) throw error;
    console.error(error);
    process.exitCode = 1;
    return { ok: false, artifactMode, error: error.message };
  } finally {
    await processSet.terminate();
  }
}
