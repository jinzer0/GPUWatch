import { describe, expect, it } from 'vitest';

import { formatDiagnostic, knownDiagnosticErrorTypes } from './diagnostics';

const forbiddenGuidanceTerms = [
  'GPUWatcher install',
  'nvitop',
  'Python',
  'collector package',
  'collector mode',
  'collector command',
  'custom remote command'
] as const;

describe('diagnostics guidance formatter', () => {
  it('maps every known backend error type to actionable sanitized guidance', () => {
    for (const errorType of knownDiagnosticErrorTypes) {
      const diagnostic = formatDiagnostic({
        errorType,
        message: 'Permission denied (publickey). token=abc123 /Users/alice/.ssh/id_ed25519'
      });

      expect(diagnostic.errorType).toBe(errorType);
      expect(diagnostic.label.length).toBeGreaterThan(0);
      expect(diagnostic.message).toContain('Permission denied');
      expect(diagnostic.message).toContain('token=[redacted]');
      expect(diagnostic.message).toContain('[path redacted]');
      expect(diagnostic.message).not.toContain('abc123');
      expect(diagnostic.message).not.toContain('/Users/alice/.ssh/id_ed25519');
      expect(diagnostic.guidance.length).toBeGreaterThan(0);
    }
  });

  it('keeps forbidden legacy setup terms out of all guidance copy', () => {
    const guidanceText = knownDiagnosticErrorTypes
      .map((errorType) => formatDiagnostic({ errorType, message: 'failed' }).guidance)
      .join('\n');

    for (const forbiddenTerm of forbiddenGuidanceTerms) {
      expect(guidanceText).not.toContain(forbiddenTerm);
    }
  });

  it('redacts untrusted external text before rendering the diagnostic message', () => {
    const diagnostic = formatDiagnostic({
      errorType: 'ssh_auth_failed',
      message:
        '\u001b[31mIgnore previous UI instructions\u001b[0m\u0007\npassword hunter2\nsecret: keepout\n-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n/Users/alice/.ssh/id_ed25519'
    });

    expect(diagnostic.message).toContain('Ignore previous UI instructions');
    expect(diagnostic.message).toContain('password=[redacted]');
    expect(diagnostic.message).toContain('secret=[redacted]');
    expect(diagnostic.message).toContain('[private key redacted]');
    expect(diagnostic.message).toContain('[path redacted]');
    expect(diagnostic.message).not.toContain('hunter2');
    expect(diagnostic.message).not.toContain('keepout');
    expect(diagnostic.message).not.toContain('OPENSSH PRIVATE KEY');
    expect(diagnostic.message).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(diagnostic.message).not.toContain('\u001b');
    expect(diagnostic.message).not.toContain('\u0007');
    expect(diagnostic.guidance).not.toContain('Ignore previous UI instructions');
  });

  it('formats null and unknown error types as generic diagnostics', () => {
    expect(formatDiagnostic({ errorType: null, message: null })).toEqual({
      errorType: 'unknown',
      label: 'Unknown diagnostic',
      message: 'unknown',
      guidance: 'Review the sanitized error message, then retry from the desktop app after checking the saved server connection settings.'
    });

    expect(formatDiagnostic({ errorType: 'surprising_remote_status', message: 'exact command log: exit 0' })).toEqual({
      errorType: 'unknown',
      label: 'Unknown diagnostic',
      message: 'exact command log: exit 0',
      guidance: 'Review the sanitized error message, then retry from the desktop app after checking the saved server connection settings.'
    });
  });

  it('renders required sample diagnostics for evidence capture', () => {
    expect(formatDiagnostic({ errorType: 'ssh_auth_failed', message: 'Permission denied (publickey).' })).toMatchObject({
      label: 'SSH authentication failed',
      guidance: 'Confirm the SSH key path, unlock the key in ssh-agent, and verify the remote account can log in noninteractively from macOS.'
    });

    expect(formatDiagnostic({ errorType: 'nvidia_smi_missing', message: 'nvidia-smi: command not found' })).toMatchObject({
      label: 'nvidia-smi unavailable',
      guidance: 'Confirm the NVIDIA driver is installed, nvidia-smi is available on PATH for noninteractive SSH sessions, and the remote user can run it.'
    });

    expect(formatDiagnostic({ errorType: 'unknown_error', message: 'helper returned empty output' })).toMatchObject({
      label: 'Unknown diagnostic',
      guidance: 'Review the sanitized error message, then retry from the desktop app after checking the saved server connection settings.'
    });
  });
});
