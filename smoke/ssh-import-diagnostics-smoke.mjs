#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createIsolatedDirs, prepareIsolatedSshConfig } from './shared/isolation.mjs';
import { canonicalDbPath, devHelperPath, evidenceDir } from './shared/paths.mjs';

const expectedAlias = 'task8-diagnostics';
const helperTimeoutMs = 10000;
const successEvidencePath = path.join(evidenceDir, 'task-8-ssh-import-diagnostics-dev-smoke.txt');
const failureEvidencePath = path.join(evidenceDir, 'task-8-ssh-import-diagnostics-failure-smoke.txt');

class SmokeAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SmokeAssertionError';
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new SmokeAssertionError(message);
  }
}

function forbiddenTextPatterns(realHome) {
  return [
    { label: 'live SSH target', pattern: /tml-server/i },
    { label: 'synthetic raw secret', pattern: /raw-secret/i },
    { label: 'task8 raw secret', pattern: /task8-secret/i },
    { label: 'task8 proxy key path', pattern: /task8_proxy_key/i },
    { label: 'private key marker', pattern: /BEGIN OPENSSH PRIVATE KEY/i },
    { label: 'real HOME', pattern: realHome ? new RegExp(realHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /$a/ }
  ];
}

function assertNoForbiddenText(label, text, realHome) {
  const matched = forbiddenTextPatterns(realHome).find(({ pattern }) => pattern.test(text));
  if (matched) {
    throw new SmokeAssertionError(`${label} exposed ${matched.label}.`);
  }
}

function runHelper(helperPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, [], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new SmokeAssertionError(`helper timed out after ${helperTimeoutMs}ms`));
    }, helperTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new SmokeAssertionError(`helper exited with code ${code ?? signal}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    child.stdin.end(`${JSON.stringify({ action: 'list_ssh_config_hosts', payload: {} })}\n`);
  });
}

function parseResponse(stdout) {
  const parsed = JSON.parse(stdout);
  assertCondition(parsed && typeof parsed === 'object', 'helper response must be a JSON object');
  assertCondition(parsed.ok === true, `helper response was not ok: ${stdout}`);
  assertCondition(parsed.data && typeof parsed.data === 'object', 'helper ok response must include data object');
  return parsed.data;
}

function findCandidate(data) {
  assertCondition(Array.isArray(data.candidates), 'import result must contain candidates array');
  const candidate = data.candidates.find((item) => item.hostAlias === expectedAlias);
  assertCondition(candidate, `expected synthetic SSH config candidate ${expectedAlias}`);
  return candidate;
}

function assertCandidate(candidate) {
  assertCondition(candidate.draft.id === null, 'SSH import candidate draft id must remain null');
  assertCondition(candidate.draft.host === expectedAlias, 'SSH import draft host must use the alias, not a live host');
  assertCondition(candidate.draft.username === 'task8-user', 'SSH import draft username must come from isolated config');
  assertCondition(candidate.draft.port === 2208, 'SSH import draft port must come from isolated config');
  assertCondition(candidate.hostname === '127.0.0.1', 'SSH import hostname must come from isolated config');
  assertCondition(candidate.warnings.some((warning) => /unsupported ProxyCommand/i.test(warning)), 'SSH import diagnostics must include sanitized unsupported ProxyCommand warning');
}

function buildSuccessEvidence({ tempDataDir, tempHomeDir, dbPath, helperPath, data, candidate, stdout }) {
  const warnings = [...data.warnings, ...candidate.warnings];
  return [
    'Task 8 isolated SSH config import/diagnostics smoke evidence',
    'Command: node smoke/ssh-import-diagnostics-smoke.mjs',
    'Surface: helper CLI action list_ssh_config_hosts through smoke harness; full Settings bulk UI assertions deferred to Todo 9 until Todos 3-5 finish the bulk import UI.',
    `Helper path: ${path.relative(process.cwd(), helperPath)}`,
    `Isolated GPUWATCHER_TEST_DATA_DIR: ${tempDataDir}`,
    `Isolated HOME containing synthetic .ssh/config: ${tempHomeDir}`,
    `Canonical smoke DB path reserved and not required for SSH import: ${dbPath}`,
    `Canonical smoke DB exists after helper-only import: ${existsSync(dbPath)}`,
    `Synthetic host alias imported: ${candidate.hostAlias}`,
    `Synthetic draft host/user/port: ${candidate.draft.host}/${candidate.draft.username}/${candidate.draft.port}`,
    `Diagnostics observed: ${warnings.filter((warning) => /include|proxycommand|outside|unsupported/i.test(warning)).join(' | ')}`,
    `Helper stdout bytes: ${stdout.length}`,
    'Isolation assertions: no production HOME, no production DB, no live SSH target, no real ~/.ssh/config, no raw ProxyCommand secret in helper output.',
    'Cleanup: isolated temp HOME/data directories removed after assertions on successful smoke runs.',
    'Deferred UI assertions for Todo 9: drive Settings bulk import checkboxes after Todos 3-5 are stable; verify selected imported inputs save with id null and enabled false.'
  ].join('\n');
}

async function run() {
  await mkdir(evidenceDir, { recursive: true });
  const realHome = process.env.HOME ?? '';
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task-8-', 'gpuwatcher-task-8-home-');
  await prepareIsolatedSshConfig(tempHomeDir);

  const helperPath = devHelperPath();
  assertCondition(existsSync(helperPath), `Helper binary missing at ${helperPath}; run npm run helper:build before this smoke.`);

  const dbPath = canonicalDbPath(tempDataDir);
  const env = { GPUWATCHER_TEST_DATA_DIR: tempDataDir, HOME: tempHomeDir };
  const { stdout, stderr } = await runHelper(helperPath, env);
  assertNoForbiddenText('helper stdout', stdout, realHome);
  assertNoForbiddenText('helper stderr', stderr, realHome);
  const data = parseResponse(stdout);
  const candidate = findCandidate(data);
  assertCandidate(candidate);

  const evidence = buildSuccessEvidence({ tempDataDir, tempHomeDir, dbPath, helperPath, data, candidate, stdout });
  assertNoForbiddenText('success evidence', evidence, realHome);
  await rm(tempDataDir, { recursive: true, force: true });
  await rm(tempHomeDir, { recursive: true, force: true });
  await writeFile(successEvidencePath, `${evidence}\n`);
  await writeFile(
    failureEvidencePath,
    [
      'Task 8 smoke-first failure characterization',
      'Red run before fixture expansion: SmokeAssertionError expected synthetic SSH config candidate task8-diagnostics.',
      'Final smoke status: PASS; no failure captured on this run. This file is reserved for catch-path stack evidence when a future smoke run fails.',
      ''
    ].join('\n')
  );
  console.log(evidence);
}

try {
  await run();
} catch (error) {
  await mkdir(evidenceDir, { recursive: true });
  const detail = error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`;
  await writeFile(failureEvidencePath, detail);
  console.error(error);
  process.exitCode = 1;
}
