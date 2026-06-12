#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, '.sisyphus', 'evidence');
const cdpPortBase = 9349;
const expectedBridgeKeys = [
  'deleteServer',
  'getServerDetail',
  'helperHealth',
  'initializeApp',
  'listGpuHistory',
  'listOverview',
  'listProcesses',
  'listServers',
  'refreshServer',
  'saveServer',
  'seedDemoData',
  'setServerEnabled',
  'testConnection'
];
const forbiddenBridgeKeys = [
  'dispatch',
  'helperPath',
  'helperRunner',
  'invoke',
  'pollDueServers',
  'poll_due_servers',
  'runAction'
];

const logs = [];
const children = [];
const screenshots = [];

function timestamp() {
  return new Date().toISOString();
}

function helperBinaryName() {
  return process.platform === 'win32' ? 'gpuwatcher-helper.exe' : 'gpuwatcher-helper';
}

function appExecutable(appPath) {
  if (process.platform === 'darwin') {
    return path.join(appPath, 'Contents', 'MacOS', 'GPUWatcher');
  }
  throw new Error(`Unsupported packaged smoke platform: ${process.platform}`);
}

function helperPathForApp(appPath) {
  return path.join(appPath, 'Contents', 'Resources', 'gpuwatcher-helper', helperBinaryName());
}

function cdpUrl(port) {
  return `http://127.0.0.1:${port}`;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(entryPath);
      paths.push(...await walk(entryPath));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

async function discoverAppPath() {
  const releaseRoot = path.join(root, 'release', 'electron');
  const paths = await walk(releaseRoot);
  const appPaths = paths.filter((candidate) => candidate.endsWith(`${path.sep}GPUWatcher.app`));
  if (appPaths.length !== 1) {
    throw new Error(`Expected exactly one release/electron/**/GPUWatcher.app, found ${appPaths.length}: ${appPaths.join(', ')}`);
  }
  return appPaths[0];
}

async function waitFor(description, callback, timeoutMs = 30000, intervalMs = 250) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await callback();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${description} did not become ready within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function connectCdp(port) {
  const pageInfo = await waitFor('packaged Electron CDP page', async () => {
    const pages = await fetchJson(`${cdpUrl(port)}/json/list`);
    return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl && !String(page.url).startsWith('devtools://')) ?? null;
  }, 45000);

  const socket = new WebSocket(pageInfo.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  return { socket, send, pageInfo };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const message = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(message);
  }
  return result.result.value;
}

async function screenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const screenshotPath = path.join(evidenceDir, filename);
  await writeFile(screenshotPath, Buffer.from(result.data, 'base64'));
  screenshots.push(screenshotPath);
  return screenshotPath;
}

async function bodyText(cdp) {
  return evaluate(cdp, 'document.body.innerText');
}

async function waitForText(cdp, text, timeoutMs = 30000) {
  try {
    return await waitFor(`text ${text}`, async () => {
      const textContent = await bodyText(cdp);
      return textContent.toLowerCase().includes(text.toLowerCase()) ? textContent : null;
    }, timeoutMs);
  } catch (error) {
    const safeName = text.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'text';
    const debugText = await evaluate(
      cdp,
      `(() => ({ url: location.href, readyState: document.readyState, bodyText: document.body.innerText, html: document.documentElement.outerHTML.slice(0, 12000) }))()`
    );
    await writeFile(path.join(evidenceDir, `task-11-missing-${safeName}.json`), `${JSON.stringify(debugText, null, 2)}\n`);
    throw error;
  }
}

async function clickText(cdp, text) {
  await evaluate(
    cdp,
    `(() => {
      const needle = ${JSON.stringify(text)};
      const element = Array.from(document.querySelectorAll('button, a')).find((candidate) =>
        candidate.textContent.trim().includes(needle) && (!('disabled' in candidate) || !candidate.disabled)
      );
      if (!element) throw new Error('No enabled clickable element with text: ' + needle);
      element.click();
      return true;
    })()`
  );
}

async function setInputByLabel(cdp, label, value) {
  await evaluate(
    cdp,
    `(() => {
      const labelText = ${JSON.stringify(label)};
      const labelNode = Array.from(document.querySelectorAll('label')).find((candidate) =>
        candidate.textContent.trim().startsWith(labelText)
      );
      if (!labelNode) throw new Error('No label found: ' + labelText);
      const input = labelNode.querySelector('input');
      if (!input) throw new Error('No input found for label: ' + labelText);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  );
}

async function setCheckboxByLabel(cdp, label, checked) {
  await evaluate(
    cdp,
    `(() => {
      const labelText = ${JSON.stringify(label)};
      const labelNode = Array.from(document.querySelectorAll('label')).find((candidate) =>
        candidate.textContent.trim().includes(labelText)
      );
      if (!labelNode) throw new Error('No checkbox label found: ' + labelText);
      const input = labelNode.querySelector('input[type="checkbox"]');
      if (!input) throw new Error('No checkbox found for label: ' + labelText);
      if (input.checked !== ${checked ? 'true' : 'false'}) {
        input.click();
      }
      return input.checked;
    })()`
  );
}

async function bridgeListServers(cdp) {
  return evaluate(
    cdp,
    `window.gpuwatcher.listServers({}).then((response) => {
      if (!response.ok) throw new Error(response.error.message);
      return response.data;
    })`
  );
}

async function bridgeHelperHealth(cdp) {
  return evaluate(cdp, 'window.gpuwatcher.helperHealth({})');
}

async function bridgeInfo(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const keys = Object.keys(window.gpuwatcher ?? {}).sort();
      return {
        hasGpuwatcher: Boolean(window.gpuwatcher),
        keys,
        forbidden: ${JSON.stringify(forbiddenBridgeKeys)}.filter((key) => keys.includes(key)),
        hasGenericDispatch: keys.some((key) => /invoke|runAction|dispatch|pollDueServers|poll_due_servers|helperPath/i.test(key)),
        electronMeta: window.gpuWatcherElectron ? { ...window.gpuWatcherElectron, migrationStatus: window.gpuWatcherElectron.migrationStatus?.() } : null,
        bodyLength: document.body.innerText.trim().length,
        url: location.href
      };
    })()`
  );
}

function launchPackagedApp({ appPath, cwd, dataDir, port, extraEnv = {} }) {
  const env = { ...process.env, ...extraEnv };
  delete env.GPUWATCHER_HELPER_PATH;
  env.GPUWATCHER_TEST_DATA_DIR = dataDir;
  env.ELECTRON_ENABLE_LOGGING = '1';
  const child = spawn(appExecutable(appPath), [`--remote-debugging-port=${port}`], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  child.stdout.on('data', (chunk) => logs.push(`[${timestamp()} packaged stdout] ${chunk.toString()}`));
  child.stderr.on('data', (chunk) => logs.push(`[${timestamp()} packaged stderr] ${chunk.toString()}`));
  child.on('exit', (code, signal) => logs.push(`[${timestamp()} packaged exit] code=${code} signal=${signal}\n`));
  return child;
}

async function closeRun(cdp, child) {
  cdp?.socket?.close();
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
}

async function runSuccess(appPath, helperPath) {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-task-11-success-'));
  const cwdParent = await mkdtemp(path.join(os.tmpdir(), 'gpuwatcher task 11 cwd parent '));
  const nonRepoCwd = path.join(cwdParent, 'non repo cwd with spaces');
  await mkdir(nonRepoCwd, { recursive: true });

  const child = launchPackagedApp({ appPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPortBase });
  const cdp = await connectCdp(cdpPortBase);
  await waitForText(cdp, 'GPUWatcher v0.1', 45000);
  await waitForText(cdp, 'Remote GPU console');
  const initialScreenshot = await screenshot(cdp, 'task-11-packaged-app-initial.png');
  const info = await bridgeInfo(cdp);
  if (!info.hasGpuwatcher) {
    throw new Error('window.gpuwatcher was not exposed in packaged app.');
  }
  if (info.bodyLength === 0) {
    throw new Error('Packaged app rendered blank UI.');
  }
  if (info.forbidden.length > 0 || info.hasGenericDispatch) {
    throw new Error(`Forbidden bridge exposure found: ${info.forbidden.join(', ')}`);
  }
  const missingBridgeKeys = expectedBridgeKeys.filter((key) => !info.keys.includes(key));
  if (missingBridgeKeys.length > 0) {
    throw new Error(`Missing expected bridge methods: ${missingBridgeKeys.join(', ')}`);
  }

  const helperHealth = await bridgeHelperHealth(cdp);
  if (!helperHealth.ok) {
    throw new Error(`Packaged helper health failed: ${JSON.stringify(helperHealth.error)}`);
  }
  const initialServers = await bridgeListServers(cdp);
  if (!Array.isArray(initialServers) || initialServers.length !== 0) {
    throw new Error(`Expected empty isolated server list, got ${JSON.stringify(initialServers)}`);
  }

  await clickText(cdp, 'Settings');
  await waitForText(cdp, 'Server registry');
  await setInputByLabel(cdp, 'Name', 'Task 11 Packaged Server');
  await setInputByLabel(cdp, 'Host', '127.0.0.1');
  await setInputByLabel(cdp, 'SSH port', '1');
  await setInputByLabel(cdp, 'Username', 'gpuwatcher-smoke');
  await setInputByLabel(cdp, 'SSH key path', '');
  await setInputByLabel(cdp, 'Polling interval seconds', '30');
  await setCheckboxByLabel(cdp, 'Enabled', false);
  await clickText(cdp, 'Save server');
  await waitForText(cdp, 'Task 11 Packaged Server');
  const servers = await waitFor('packaged saved server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 1 && listed[0].name === 'Task 11 Packaged Server' ? listed : null;
  });
  const savedScreenshot = await screenshot(cdp, 'task-11-packaged-app-settings-saved.png');
  const dbPath = path.join(tempDataDir, 'GPUWatcher', 'gpuwatcher.sqlite3');
  await closeRun(cdp, child);

  return {
    tempDataDir,
    nonRepoCwd,
    dbPath,
    initialScreenshot,
    savedScreenshot,
    bridgeInfo: info,
    helperHealth,
    servers,
    helperPath,
    appPath
  };
}

async function runFailure(appPath, helperPath) {
  const originalMode = (await stat(helperPath)).mode;
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-task-11-failure-'));
  const cwdParent = await mkdtemp(path.join(os.tmpdir(), 'gpuwatcher task 11 failure cwd parent '));
  const nonRepoCwd = path.join(cwdParent, 'non repo cwd with spaces');
  await mkdir(nonRepoCwd, { recursive: true });
  await chmod(helperPath, originalMode & ~0o111);

  let cdp;
  let child;
  try {
    child = launchPackagedApp({ appPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPortBase + 1 });
    cdp = await connectCdp(cdpPortBase + 1);
    await waitForText(cdp, 'GPUWatcher v0.1', 45000);
    await clickText(cdp, 'Settings');
    await waitForText(cdp, 'Server registry');
    const bridgeError = await bridgeHelperHealth(cdp);
    if (bridgeError.ok || bridgeError.error?.layer !== 'helper_contract' || !/helper_(spawn_failed|runner_error)/.test(bridgeError.error?.type ?? '')) {
      throw new Error(`Expected structured helper_contract helper failure through renderer bridge, got ${JSON.stringify(bridgeError)}`);
    }
    await setInputByLabel(cdp, 'Name', 'Task 11 Helper Failure Server');
    await setInputByLabel(cdp, 'Host', '127.0.0.1');
    await setInputByLabel(cdp, 'SSH port', '1');
    await setInputByLabel(cdp, 'Username', 'gpuwatcher-smoke');
    await setInputByLabel(cdp, 'SSH key path', '');
    await setInputByLabel(cdp, 'Polling interval seconds', '30');
    await setCheckboxByLabel(cdp, 'Enabled', false);
    await clickText(cdp, 'Save server');
    const errorBody = await waitFor('visible non-executable helper error', async () => {
      const text = await bodyText(cdp);
      return /permission denied|EACCES|failed to spawn helper|spawn .*gpuwatcher-helper/i.test(text) ? text : null;
    }, 45000);
    const errorScreenshot = await screenshot(cdp, 'task-11-packaged-helper-nonexec-error.png');
    await clickText(cdp, 'Overview');
    await waitForText(cdp, 'Fleet snapshot');
    await clickText(cdp, 'Settings');
    await waitForText(cdp, 'Server registry');
    const navigableBody = await bodyText(cdp);
    await closeRun(cdp, child);
    return { tempDataDir, nonRepoCwd, bridgeError, errorBody, errorScreenshot, navigableBody };
  } finally {
    await chmod(helperPath, originalMode);
    if (cdp || child) {
      await closeRun(cdp, child);
    }
  }
}

function selectedLogExcerpt() {
  return logs
    .filter((line) => /warning|error|helper|GPUWatcher|packaged exit|stderr/i.test(line))
    .slice(0, 40)
    .join('')
    .slice(0, 8000);
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const startedAt = timestamp();
  const appPath = await discoverAppPath();
  const helperPath = helperPathForApp(appPath);
  const executablePath = appExecutable(appPath);
  await access(executablePath, constants.X_OK);
  await access(helperPath, constants.X_OK);
  const helperMode = (await stat(helperPath)).mode & 0o777;

  const success = await runSuccess(appPath, helperPath);
  const failure = await runFailure(appPath, helperPath);
  await access(helperPath, constants.X_OK);

  const packLogPath = path.join(evidenceDir, 'task-11-electron-pack.log');
  const packLog = existsSync(packLogPath) ? await import('node:fs/promises').then((fs) => fs.readFile(packLogPath, 'utf8')) : '';
  const packageWarnings = packLog
    .split('\n')
    .filter((line) => /missed|warning|default Electron icon|skipped macOS code signing|requires signing|DEP0190/i.test(line))
    .join('\n');

  const launchEvidence = [
    'Task 11 unsigned packaged Electron app launch smoke evidence',
    `Started at: ${startedAt}`,
    `Completed at: ${timestamp()}`,
    'Package command: npm run electron:pack',
    `Package log: ${packLogPath}`,
    `Package warnings: ${packageWarnings || 'No package warnings captured in task-11-electron-pack.log.'}`,
    `Discovered app count: 1`,
    `Discovered app path: ${appPath}`,
    `Packaged app executable: ${executablePath}`,
    `Packaged helper path: ${helperPath}`,
    `Packaged helper executable mode: ${helperMode.toString(8)}`,
    `Helper outside ASAR: ${helperPath.includes(`${path.sep}Contents${path.sep}Resources${path.sep}gpuwatcher-helper${path.sep}`)}`,
    `Success launch cwd: ${success.nonRepoCwd}`,
    'Success launch environment: GPUWATCHER_HELPER_PATH unset; GPUWATCHER_TEST_DATA_DIR isolated',
    `Isolated data dir: ${success.tempDataDir}`,
    `Canonical test DB exists: ${existsSync(success.dbPath)} (${success.dbPath})`,
    `Renderer URL: ${success.bridgeInfo.url}`,
    `Nonblank UI body length: ${success.bridgeInfo.bodyLength}`,
    `window.gpuwatcher exposed: ${success.bridgeInfo.hasGpuwatcher}`,
    `Bridge keys: ${success.bridgeInfo.keys.join(', ')}`,
    `Forbidden bridge keys absent: ${forbiddenBridgeKeys.join(', ')}`,
    `Electron metadata: ${JSON.stringify(success.bridgeInfo.electronMeta)}`,
    `helperHealth via renderer/preload/IPC/helper: ${JSON.stringify(success.helperHealth)}`,
    `listServers via renderer/preload/IPC/helper before save: []`,
    `listServers after UI save: ${JSON.stringify(success.servers)}`,
    `Screenshots: ${success.initialScreenshot}; ${success.savedScreenshot}`,
    `Packaged app log excerpt: ${selectedLogExcerpt() || 'No relevant packaged app log excerpt.'}`
  ].join('\n');

  const failureEvidence = [
    'Task 11 packaged helper resolution failure evidence',
    `Started at: ${startedAt}`,
    `Completed at: ${timestamp()}`,
    `Failure mode: temporarily chmod removed executable bits from packaged helper, then restored them`,
    `App path: ${appPath}`,
    `Helper path: ${helperPath}`,
    `Failure launch cwd: ${failure.nonRepoCwd}`,
    'Failure launch environment: GPUWATCHER_HELPER_PATH unset; GPUWATCHER_TEST_DATA_DIR isolated',
    `Isolated data dir: ${failure.tempDataDir}`,
    `Renderer bridge structured helperHealth error: ${JSON.stringify(failure.bridgeError)}`,
    `Visible helper error excerpt: ${failure.errorBody.split('\n').filter((line) => /helper_spawn_failed|permission denied|EACCES|failed to spawn helper|helper_contract|helper|error/i.test(line)).slice(0, 12).join(' | ')}`,
    `App remained nonblank after helper error: ${failure.errorBody.toLowerCase().includes('gpuwatcher v0.1') && failure.errorBody.toLowerCase().includes('server registry')}`,
    `Navigation after helper error: ${failure.navigableBody.toLowerCase().includes('fleet snapshot') || failure.navigableBody.toLowerCase().includes('server registry')}`,
    `Helper restored executable: ${existsSync(helperPath)}`,
    `Screenshot: ${failure.errorScreenshot}`,
    `Packaged app log excerpt: ${selectedLogExcerpt() || 'No relevant packaged app log excerpt.'}`
  ].join('\n');

  await writeFile(path.join(evidenceDir, 'task-11-packaged-app-launch-smoke.txt'), `${launchEvidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-11-helper-resolution-failures.txt'), `${failureEvidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-11-packaged-app.log'), logs.join(''));
  console.log(launchEvidence);
  console.log('');
  console.log(failureEvidence);
}

main()
  .catch(async (error) => {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'task-11-packaged-smoke-failure.txt'), `${error.stack ?? error.message}\n`);
    await writeFile(path.join(evidenceDir, 'task-11-packaged-app.log'), logs.join(''));
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children.reverse()) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
  });
