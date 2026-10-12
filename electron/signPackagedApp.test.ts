// @vitest-environment node

import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import signPackagedApp, { createSignPackagedApp } from './signPackagedApp.mjs';

const identity = 'Developer ID Application: GPUWatcher Test (ABCDEFGHIJ)';
const hash = 'A'.repeat(40);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  // macOS /var is a symlink; canonicalize the temp root before signing checks.
  const { realpath } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'gpuwatcher-sign-test-'));
  roots.push(root);
  const app = path.join(root, 'GPUWatcher.app');
  const helper = path.join(app, 'Contents', 'Resources', 'gpuwatcher-helper', 'gpuwatcher-helper');
  await mkdir(path.dirname(helper), { recursive: true });
  await writeFile(helper, 'mock native executable', { mode: 0o755 });
  return { root, app, helper };
}

function options(app: string) {
  return { app, identity, platform: 'darwin', type: 'distribution' };
}

describe('native packaged app signer', () => {
  it('exports an electron-builder callback and delegates resolved native options without mutating input', async () => {
    const { app, helper } = await fixture();
    const frameworkOptions = Object.freeze({
      entitlements: '/native/framework.plist', hardenedRuntime: true,
      requirements: '=designated => anchor apple', timestamp: 'https://timestamp.apple.com/ts'
    });
    const optionsForFile = vi.fn(() => frameworkOptions);
    const binaries = Object.freeze([helper]);
    const ignore = vi.fn(() => false);
    const original = Object.freeze({
      ...options(app), identity: hash, identityValidation: false,
      optionsForFile, binaries, ignore, keychain: '/temporary/keychain',
      version: '40.0.0', preAutoEntitlements: true, strictVerify: true
    });
    const nativeSign = vi.fn(async (received) => {
      expect(received).not.toBe(original);
      expect(received).toMatchObject({
        app, identity: hash, identityValidation: true, keychain: original.keychain,
        version: original.version, strictVerify: true, preAutoEntitlements: false,
        preEmbedProvisioningProfile: false
      });
      expect(received.binaries).toBe(binaries);
      expect(received.ignore).toBe(ignore);
      const framework = path.join(app, 'Contents', 'Frameworks', 'Electron Framework.framework');
      expect(received.optionsForFile(framework)).toBe(frameworkOptions);
      expect(optionsForFile).toHaveBeenCalledWith(framework);
      expect(received.optionsForFile(helper)).toEqual({
        entitlements: expect.stringContaining('build/entitlements.helper.plist'), hardenedRuntime: true
      });
      for (const unrelated of [helper + '.backup', path.dirname(helper), helper.replace('GPUWatcher.app', 'Other.app')]) {
        expect(received.optionsForFile(unrelated)).toBe(frameworkOptions);
      }
      expect(optionsForFile).not.toHaveBeenCalledWith(helper);
    });
    expect(typeof signPackagedApp).toBe('function');
    await createSignPackagedApp({ signAsync: nativeSign })(original, {
      platformSpecificBuildOptions: { identity }
    });
    expect(nativeSign).toHaveBeenCalledTimes(1);
    expect(original.optionsForFile).toBe(optionsForFile);
    expect(original.preAutoEntitlements).toBe(true);
    expect(original.identityValidation).toBe(false);
    expect(frameworkOptions.entitlements).toBe('/native/framework.plist');
  });

  it('leaves library defaults untouched when there is no native per-file override', async () => {
    const { app, helper } = await fixture();
    const nativeSign = vi.fn(async (received) => {
      expect(received.optionsForFile(path.join(app, 'Contents', 'Frameworks', 'GPU.app'))).toBeUndefined();
      expect(received.optionsForFile(helper).hardenedRuntime).toBe(true);
    });
    await createSignPackagedApp({ signAsync: nativeSign })(options(app), {});
    expect(nativeSign).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, '', ' ', '-', 'adhoc', 'ad-hoc', 'Apple Development: Test (ABCDEFGHIJ)',
    'Developer ID Application:', identity + ' ', ' ' + identity, identity + '\n'])('rejects unsafe or absent identity %s', async (unsafe) => {
    const { app } = await fixture();
    const nativeSign = vi.fn();
    await expect(createSignPackagedApp({ signAsync: nativeSign })({ ...options(app), identity: unsafe }, {})).rejects.toThrow(/identity/);
    expect(nativeSign).not.toHaveBeenCalled();
  });

  it.each([hash, hash.toLowerCase()])('accepts resolved certificate hash %s without requiring a CN in the adapter', async (certificateHash) => {
    const { app } = await fixture();
    const nativeSign = vi.fn();
    await createSignPackagedApp({ signAsync: nativeSign })({ ...options(app), identity: certificateHash }, {});
    expect(nativeSign).toHaveBeenCalledTimes(1);
    expect(nativeSign.mock.calls[0][0]).toMatchObject({ identity: certificateHash, identityValidation: true });
  });

  it.each([{ platform: 'mas' }, { type: 'development' }, { type: undefined }, { type: 'unknown' }])('rejects unsupported signing mode %s', async (mode) => {
    const { app } = await fixture();
    const nativeSign = vi.fn();
    await expect(createSignPackagedApp({ signAsync: nativeSign })({ ...options(app), ...mode }, {})).rejects.toThrow(/distribution/);
    expect(nativeSign).not.toHaveBeenCalled();
  });

  it('rejects noncanonical app paths that would bypass exact helper permission matching', async () => {
    const { root } = await fixture();
    const nativeSign = vi.fn();
    const app = `${root}/GPUWatcher.app/../GPUWatcher.app`;
    await expect(createSignPackagedApp({ signAsync: nativeSign })(options(app), {})).rejects.toThrow(/absolute packaged/);
    expect(nativeSign).not.toHaveBeenCalled();
  });

  it('propagates absence of an actual certificate instead of falling back', async () => {
    const { app } = await fixture();
    const failure = new Error('No identity found for signing.');
    const nativeSign = vi.fn().mockRejectedValue(failure);
    await expect(createSignPackagedApp({ signAsync: nativeSign })(options(app), {})).rejects.toBe(failure);
    expect(nativeSign).toHaveBeenCalledTimes(1);
    expect(nativeSign.mock.calls[0][0].identityValidation).toBe(true);
  });

  it.each(['missing', 'directory', 'symlink', 'non-executable', 'symlink-parent'])('rejects %s helper before delegating', async (kind) => {
    const { root, app, helper } = await fixture();
    if (kind === 'non-executable') {
      await chmod(helper, 0o644);
    } else if (kind === 'symlink-parent') {
      const moved = path.join(root, 'moved-helper');
      await mkdir(moved);
      await writeFile(path.join(moved, 'gpuwatcher-helper'), 'executable', { mode: 0o755 });
      await rm(path.dirname(helper), { recursive: true });
      await symlink(moved, path.dirname(helper));
    } else {
      await rm(helper);
      if (kind === 'directory') await mkdir(helper);
      if (kind === 'symlink') {
        const target = path.join(root, 'target');
        await writeFile(target, 'executable', { mode: 0o755 });
        await symlink(target, helper);
      }
    }
    const nativeSign = vi.fn();
    await expect(createSignPackagedApp({ signAsync: nativeSign })(options(app), {})).rejects.toThrow();
    expect(nativeSign).not.toHaveBeenCalled();
  });

  it('rejects an ignore rule excluding the helper', async () => {
    const { app, helper } = await fixture();
    const nativeSign = vi.fn();
    await expect(createSignPackagedApp({ signAsync: nativeSign })({
      ...options(app), ignore: (file: string) => file === helper
    }, {})).rejects.toThrow(/excluded/);
    expect(nativeSign).not.toHaveBeenCalled();
  });

  it('keeps app entitlements JIT-only and helper entitlements empty', async () => {
    const appPlist = await readFile(new URL('../build/entitlements.mac.plist', import.meta.url), 'utf8');
    const helperPlist = await readFile(new URL('../build/entitlements.helper.plist', import.meta.url), 'utf8');
    expect(appPlist.match(/<key>[^<]+<\/key>/g)).toEqual(['<key>com.apple.security.cs.allow-jit</key>']);
    expect(appPlist).toMatch(/<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/);
    expect(helperPlist).toMatch(/<dict\/>/);
    expect(helperPlist).not.toContain('<key>');
    for (const plist of [appPlist, helperPlist]) {
      expect(plist).not.toMatch(/disable-library-validation|allow-unsigned-executable-memory|get-task-allow|allow-dyld-environment-variables/);
    }
  });
});
