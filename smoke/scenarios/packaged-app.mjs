import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { waitForText } from '../shared/dom.mjs';
import { createProcessSet, timestamp } from '../shared/processes.mjs';
import { appExecutable, discoverAppPath, evidenceDir, helperPathForApp } from '../shared/paths.mjs';
import { buildPackagedEvidence } from './packaged-app/evidence.mjs';
import { runPackagedHelperErrorScenario } from './packaged-app/helper-error.mjs';
import { runPackagedStartupScenario, verifyPackagedRuntimePaths } from './packaged-app/startup.mjs';

const taskEvidenceName = 'task-2-gpuwatcher-maintainability-refactor-plan';
const cdpPortBase = 9349;

async function packagedWaitForText(cdp, text, timeoutMs = 30000) {
  return waitForText(cdp, text, { evidenceDir, missingPrefix: taskEvidenceName, timeoutMs });
}

async function runScenario(logs, screenshots, spawnLogged) {
  await mkdir(evidenceDir, { recursive: true });
  const startedAt = timestamp();
  const appPath = await discoverAppPath();
  const helperPath = helperPathForApp(appPath);
  const executablePath = appExecutable(appPath);
  await verifyPackagedRuntimePaths({ executablePath, helperPath });
  const helperMode = (await stat(helperPath)).mode & 0o777;
  const success = await runPackagedStartupScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort: cdpPortBase, waitForText: packagedWaitForText, timestamp });
  const failure = await runPackagedHelperErrorScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort: cdpPortBase + 1, waitForText: packagedWaitForText, timestamp });
  await access(helperPath, constants.X_OK);
  const evidence = await buildPackagedEvidence({ taskEvidenceName, startedAt, appPath, helperPath, executablePath, helperMode, success, failure, logs, timestamp });
  await writeFile(path.join(evidenceDir, `${taskEvidenceName}.txt`), `${evidence.launchEvidence}\n\n${evidence.failureEvidence}\n`);
  await writeFile(path.join(evidenceDir, `${taskEvidenceName}-helper-resolution-failures.txt`), `${evidence.failureEvidence}\n`);
  await writeFile(path.join(evidenceDir, `${taskEvidenceName}-packaged-app.log`), logs.join(''));
  console.log(evidence.launchEvidence);
  console.log('');
  console.log(evidence.failureEvidence);
}

export async function runPackagedAppSmoke() {
  const logs = [];
  const screenshots = [];
  const processSet = createProcessSet();
  try {
    await runScenario(logs, screenshots, processSet.spawnLogged);
  } catch (error) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, `${taskEvidenceName}-packaged-smoke-failure.txt`), `${error.stack ?? error.message}\n`);
    await writeFile(path.join(evidenceDir, `${taskEvidenceName}-packaged-app.log`), logs.join(''));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await processSet.terminate();
  }
}
