import { access, constants, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { signAsync } from '@electron/osx-sign';

const helperParts = ['Contents', 'Resources', 'gpuwatcher-helper', 'gpuwatcher-helper'];
const helperEntitlements = fileURLToPath(new URL('../build/entitlements.helper.plist', import.meta.url));
const developerIdentity = /^Developer ID Application: [^\x00-\x1f\x7f]+ \([A-Z0-9]{10}\)$/;
const identityHash = /^[A-Fa-f0-9]{40}$/;

function validateIdentity(options) {
  const identity = options.identity;
  if (typeof identity !== 'string' || identity !== identity.trim() ||
      (!developerIdentity.test(identity) && !identityHash.test(identity))) {
    throw new Error('An explicit Developer ID Application signing identity is required; ad-hoc signing is forbidden.');
  }
  // electron-builder resolves the certificate hash; the driver checks its CN/Team ID.
  if (options.platform !== 'darwin' || options.type !== 'distribution') {
    throw new Error('Only Developer ID distribution signing for darwin is supported.');
  }
}

async function validateHelper(app) {
  if (typeof app !== 'string' || !path.isAbsolute(app) || path.resolve(app) !== app || !app.endsWith('.app')) {
    throw new Error('Signing requires an absolute packaged .app path.');
  }
  let current = path.parse(app).root;
  const parts = [...app.slice(current.length).split(path.sep), ...helperParts];
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error('Packaged helper and its parent directories must be regular, non-symlink paths.');
    }
    if (index === parts.length - 1 && (stat.mode & 0o111) === 0) {
      throw new Error('Packaged helper must be executable.');
    }
  }
  await access(current, constants.X_OK);
  return current;
}

function ignoresHelper(ignore, helper) {
  return (Array.isArray(ignore) ? ignore : [ignore]).some((entry) => {
    if (entry === undefined || entry === null) return false;
    return typeof entry === 'function' ? entry(helper) : helper.match(entry) !== null;
  });
}

export function createSignPackagedApp({ signAsync: nativeSign = signAsync } = {}) {
  return async function signPackagedApp(options, packager) {
    validateIdentity(options);
    const helper = await validateHelper(options.app);
    if (ignoresHelper(options.ignore, helper)) {
      throw new Error('The packaged helper must not be excluded from signing.');
    }
    const originalOptionsForFile = options.optionsForFile;
    const nativeOptions = {
      ...options,
      // Validate the supplied certificate instead of allowing implicit selection.
      identityValidation: true,
      // No sandbox/application-group automation or implicit provisioning profile.
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      optionsForFile(filePath) {
        if (filePath === helper) {
          return { entitlements: helperEntitlements, hardenedRuntime: true };
        }
        return originalOptionsForFile?.(filePath);
      }
    };
    await nativeSign(nativeOptions);
  };
}

export default createSignPackagedApp();
