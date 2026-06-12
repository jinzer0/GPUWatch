#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, '.sisyphus', 'evidence');
const viteUrl = 'http://127.0.0.1:5173';
const cdpPort = 9339;
const cdpUrl = `http://127.0.0.1:${cdpPort}`;
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

const logs = {
  vite: [],
  electron: []
};
const children = [];

function executable(name) {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

function spawnLogged(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  const capture = (streamName, chunk) => {
    logs[name].push(`[${streamName}] ${chunk.toString()}`);
  };
  child.stdout.on('data', (chunk) => capture('stdout', chunk));
  child.stderr.on('data', (chunk) => capture('stderr', chunk));
  return child;
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

async function connectCdp() {
  const pageInfo = await waitFor('Electron CDP page', async () => {
    const pages = await fetchJson(`${cdpUrl}/json/list`);
    return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl && String(page.url).startsWith('http://127.0.0.1:5173')) ?? null;
  });

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

  return { socket, send };
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
  return screenshotPath;
}

async function bodyText(cdp) {
  return evaluate(cdp, 'document.body.innerText');
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

async function waitForText(cdp, text, timeoutMs = 15000) {
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
    await writeFile(path.join(evidenceDir, `task-9-missing-${safeName}.json`), `${JSON.stringify(debugText, null, 2)}\n`);
    throw error;
  }
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

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'gpuwatcher-task-9-'));
  const helperPath = path.join(root, 'crates', 'gpuwatcher-helper', 'target', 'debug', process.platform === 'win32' ? 'gpuwatcher-helper.exe' : 'gpuwatcher-helper');
  if (!existsSync(helperPath)) {
    throw new Error(`Helper binary missing at ${helperPath}; run npm run helper:build before this smoke.`);
  }

  const vite = spawnLogged('vite', executable('vite'), ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], {});
  await waitFor('Vite dev server', async () => {
    const response = await fetch(viteUrl).catch(() => null);
    return response?.ok;
  });

  spawnLogged(
    'electron',
    executable('electron'),
    [`--remote-debugging-port=${cdpPort}`, path.join(root, 'dist-electron', 'electron', 'main.js')],
    {
      VITE_DEV_SERVER_URL: viteUrl,
      GPUWATCHER_TEST_DATA_DIR: tempDataDir,
      GPUWATCHER_HELPER_PATH: helperPath,
      ELECTRON_ENABLE_LOGGING: '1'
    }
  );

  const cdp = await connectCdp();
  await waitForText(cdp, 'GPUWatcher v0.1', 30000);
  await waitForText(cdp, 'Remote GPU console');
  const initialScreenshot = await screenshot(cdp, 'task-9-electron-first-run-initial.png');

  const bridgeInfo = await evaluate(
    cdp,
    `(() => {
      const keys = Object.keys(window.gpuwatcher ?? {}).sort();
      return {
        hasGpuwatcher: Boolean(window.gpuwatcher),
        keys,
        forbidden: ${JSON.stringify(forbiddenBridgeKeys)}.filter((key) => keys.includes(key)),
        hasGenericDispatch: keys.some((key) => /invoke|runAction|dispatch|pollDueServers|poll_due_servers|helperPath/i.test(key)),
        electronMeta: window.gpuWatcherElectron ? { ...window.gpuWatcherElectron, migrationStatus: window.gpuWatcherElectron.migrationStatus?.() } : null
      };
    })()`
  );

  if (!bridgeInfo.hasGpuwatcher) {
    throw new Error('window.gpuwatcher was not exposed.');
  }
  if (bridgeInfo.forbidden.length > 0 || bridgeInfo.hasGenericDispatch) {
    throw new Error(`Forbidden bridge exposure found: ${bridgeInfo.forbidden.join(', ')}`);
  }
  const missingBridgeKeys = expectedBridgeKeys.filter((key) => !bridgeInfo.keys.includes(key));
  if (missingBridgeKeys.length > 0) {
    throw new Error(`Missing expected bridge methods: ${missingBridgeKeys.join(', ')}`);
  }

  await clickText(cdp, 'Settings');
  await waitForText(cdp, 'Server registry');
  await setInputByLabel(cdp, 'Name', 'Task 9 Smoke Server');
  await setInputByLabel(cdp, 'Host', '127.0.0.1');
  await setInputByLabel(cdp, 'SSH port', '1');
  await setInputByLabel(cdp, 'Username', 'gpuwatcher-smoke');
  await setInputByLabel(cdp, 'SSH key path', '');
  await setInputByLabel(cdp, 'Polling interval seconds', '30');
  await setCheckboxByLabel(cdp, 'Enabled', false);
  await clickText(cdp, 'Save server');
  await waitForText(cdp, 'Task 9 Smoke Server');
  let servers = await waitFor('saved server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 1 && listed[0].name === 'Task 9 Smoke Server' ? listed : null;
  });
  const savedServerId = servers[0].id;
  const afterSaveScreenshot = await screenshot(cdp, 'task-9-electron-first-run-settings-saved.png');

  await setInputByLabel(cdp, 'Name', 'Task 9 Smoke Server Edited');
  await clickText(cdp, 'Save server');
  await waitForText(cdp, 'Task 9 Smoke Server Edited');
  servers = await waitFor('edited server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 1 && listed[0].id === savedServerId && listed[0].name === 'Task 9 Smoke Server Edited' ? listed : null;
  });

  await clickText(cdp, 'Task 9 Smoke Server Edited');
  await clickText(cdp, 'Test SSH connection');
  const errorBody = await waitFor('visible SSH/helper error', async () => {
    return evaluate(
      cdp,
      `(() => {
        const resultSurface = Array.from(document.querySelectorAll('.surface')).find((element) =>
          /ssh_unreachable|connection refused|helper|backend_unavailable/i.test(element.textContent || '')
        );
        if (!resultSurface) return null;
        resultSurface.scrollIntoView({ block: 'center' });
        return document.body.innerText;
      })()`
    );
  }, 120000).catch(async (error) => {
    const debugText = await evaluate(
      cdp,
      `(() => ({ url: location.href, readyState: document.readyState, bodyText: document.body.innerText, html: document.documentElement.outerHTML.slice(0, 12000) }))()`
    );
    await writeFile(path.join(evidenceDir, 'task-9-visible-error-timeout.json'), `${JSON.stringify(debugText, null, 2)}\n`);
    throw error;
  });
  const errorScreenshot = await screenshot(cdp, 'task-9-visible-error-path.png');

  await clickText(cdp, 'Overview');
  await waitForText(cdp, 'Fleet snapshot');
  await clickText(cdp, 'Settings');
  await waitForText(cdp, 'Server registry');

  await clickText(cdp, 'Delete');
  await waitFor('deleted server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 0 ? listed : null;
  });
  await waitForText(cdp, 'No servers');
  const afterDeleteScreenshot = await screenshot(cdp, 'task-9-electron-first-run-settings-deleted.png');

  const dbPath = path.join(tempDataDir, 'GPUWatcher', 'gpuwatcher.sqlite3');
  const parityEvidence = [
    'Task 9 Electron first-run UI parity evidence',
    `Command: npm run smoke:electron:first-run`,
    `Surface: actual Electron main/preload/renderer launched from dist-electron/electron/main.js with Vite renderer at ${viteUrl}`,
    `Packaged app smoke: reserved for Task 11; this task used the Electron dev surface as allowed.`,
    `Isolated data dir: ${tempDataDir}`,
    `Canonical test DB exists: ${existsSync(dbPath)} (${dbPath})`,
    `Static identity visible: GPUWatcher v0.1; Remote GPU console`,
    `Bridge keys: ${bridgeInfo.keys.join(', ')}`,
    `Forbidden bridge keys absent: ${forbiddenBridgeKeys.join(', ')}`,
    `Electron metadata: ${JSON.stringify(bridgeInfo.electronMeta)}`,
    `Settings add/list/edit/delete through UI: saved ${savedServerId}, edited name to ${servers[0].name}, deleted back to zero servers`,
    `Screenshots: ${initialScreenshot}; ${afterSaveScreenshot}; ${afterDeleteScreenshot}`
  ].join('\n');

  const errorEvidence = [
    'Task 9 visible backend/SSH/helper error path evidence',
    `Action: Settings -> Test SSH connection for disabled smoke server ${savedServerId} at 127.0.0.1:1`,
    `Visible error excerpt: ${errorBody.split('\n').filter((line) => /error|ssh|connection|helper/i.test(line)).slice(0, 8).join(' | ')}`,
    `App remained nonblank: ${errorBody.toLowerCase().includes('gpuwatcher v0.1') && errorBody.toLowerCase().includes('server registry')}`,
    `Navigation after error: clicked Overview and returned to Settings successfully`,
    `Screenshot: ${errorScreenshot}`,
    `Isolated data dir: ${tempDataDir}`
  ].join('\n');

  await writeFile(path.join(evidenceDir, 'task-9-electron-first-run-ui-parity.txt'), `${parityEvidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-9-visible-error-path.txt'), `${errorEvidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-9-vite.log'), logs.vite.join(''));
  await writeFile(path.join(evidenceDir, 'task-9-electron.log'), logs.electron.join(''));

  cdp.socket.close();
  console.log(parityEvidence);
  console.log('');
  console.log(errorEvidence);
}

main()
  .catch(async (error) => {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'task-9-smoke-failure.txt'), `${error.stack ?? error.message}\n`);
    await writeFile(path.join(evidenceDir, 'task-9-vite.log'), logs.vite.join(''));
    await writeFile(path.join(evidenceDir, 'task-9-electron.log'), logs.electron.join(''));
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

