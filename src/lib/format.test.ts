import { describe, expect, it } from 'vitest';

import {
  formatCommand,
  formatDrawerCommand,
  formatKiBPerSecond,
  formatMiB,
  formatPercent,
  formatRuntimeSeconds,
  formatTemperature,
  formatUnknown,
  formatWatts,
  sanitizeMessage
} from './format';

const secretPhraseCases = [
  {
    input: 'python --token "secret value" --flag ok',
    output: 'python --token=[redacted] --flag ok',
    residuals: ['secret value', 'value"']
  },
  {
    input: 'python --api-key="alpha beta" --verbose',
    output: 'python --api-key=[redacted] --verbose',
    residuals: ['alpha beta', 'beta"']
  },
  {
    input: 'password hunter 2',
    output: 'password=[redacted]',
    residuals: ['hunter 2', ' 2']
  },
  {
    input: "python --access-token 'gamma delta' --check",
    output: 'python --access-token=[redacted] --check',
    residuals: ['gamma delta', "delta'"]
  },
  {
    input: 'secret red green blue',
    output: 'secret=[redacted]',
    residuals: ['red green blue', ' green blue']
  }
] as const;

describe('format helpers', () => {
  it('renders unavailable metrics as unknown instead of zero', () => {
    expect(formatUnknown(null)).toBe('unknown');
    expect(formatMiB(null)).toBe('unknown');
    expect(formatPercent(undefined)).toBe('unknown');
    expect(formatTemperature(null)).toBe('unknown');
    expect(formatWatts(undefined)).toBe('unknown');
    expect(formatKiBPerSecond(null)).toBe('unknown');
    expect(formatKiBPerSecond(undefined)).toBe('unknown');
    expect(formatRuntimeSeconds(null)).toBe('unknown');
    expect(formatRuntimeSeconds(undefined)).toBe('unknown');
  });

  it('renders numeric zero only when zero is provided', () => {
    expect(formatMiB(0)).toBe('0 MiB');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatKiBPerSecond(0)).toBe('0 KiB/s');
    expect(formatRuntimeSeconds(0)).toBe('0s');
  });

  it('renders KiB/s and runtime seconds with stable units', () => {
    expect(formatKiBPerSecond(1536)).toBe('1,536 KiB/s');
    expect(formatRuntimeSeconds(59)).toBe('59s');
    expect(formatRuntimeSeconds(61)).toBe('1m 1s');
    expect(formatRuntimeSeconds(3661)).toBe('1h 1m 1s');
  });

  it('redacts secret command arguments without retaining raw values', () => {
    const command = 'python --token=supersecret --password hunter2 --secret=keepout --api-key=abcdef123 --key keyfile --access-token bearer';

    expect(formatCommand(command)).toContain('--token=[redacted]');
    expect(formatCommand(command)).toContain('--password=[redacted]');
    expect(formatCommand(command)).toContain('--secret=[redacted]');
    expect(formatCommand(command)).toContain('--api-key=[redacted]');
    expect(formatCommand(command)).not.toContain('supersecret');
    expect(formatCommand(command)).not.toContain('hunter2');
    expect(formatCommand(command)).not.toContain('keepout');
    expect(formatCommand(command)).not.toContain('abcdef123');
    expect(formatCommand(command)).not.toContain('keyfile');
    expect(formatCommand(command)).not.toContain('bearer');
  });

  it('redacts secret messages, private key material, and key paths', () => {
    expect(formatCommand('python train.py --access-token secret-token')).toBe('python train.py --access-token=[redacted]');
    expect(formatCommand('token: secret-token')).toBe('token=[redacted]');
    expect(formatCommand('-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----')).toBe('[private key redacted]');
    expect(formatCommand('/Users/alice/.ssh/id_ed25519')).toBe('[path redacted]');
  });

  it('fully redacts quoted and unquoted secret phrases in messages', () => {
    // Given: secret-bearing messages with quoted values, unquoted phrases, and following command flags.
    for (const testCase of secretPhraseCases) {
      // When: the message boundary sanitizes the value.
      const message = sanitizeMessage(testCase.input);

      // Then: no trailing secret fragment remains and safe following flags are preserved.
      expect(message).toBe(testCase.output);
      for (const residual of testCase.residuals) {
        expect(message).not.toContain(residual);
      }
    }
  });

  it('fully redacts quoted and unquoted secret phrases in command previews', () => {
    // Given: secret-bearing commands short enough to avoid preview truncation.
    for (const testCase of secretPhraseCases) {
      // When: the command preview is formatted.
      const command = formatCommand(testCase.input);

      // Then: the complete secret phrase is removed without consuming the next flag.
      expect(command).toBe(testCase.output);
      for (const residual of testCase.residuals) {
        expect(command).not.toContain(residual);
      }
    }
  });

  it('fully redacts quoted and unquoted secret phrases in drawer commands', () => {
    // Given: secret-bearing full commands that the drawer renders without truncation.
    for (const testCase of secretPhraseCases) {
      // When: the full drawer command is formatted.
      const command = formatDrawerCommand(testCase.input);

      // Then: no secret fragment remains and safe command context remains visible.
      expect(command).toBe(testCase.output);
      for (const residual of testCase.residuals) {
        expect(command).not.toContain(residual);
      }
    }
  });

  it('sanitizes multi-line diagnostics while preserving safe context', () => {
    const message = sanitizeMessage(
      '\u001b[31mPermission denied\u001b[0m\u0007\nWARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\npassword hunter2\ntoken=abc123\n/Users/alice/.ssh/id_ed25519'
    );

    expect(message).toContain('Permission denied');
    expect(message).toContain('REMOTE HOST IDENTIFICATION');
    expect(message).toContain('password=[redacted]');
    expect(message).toContain('token=[redacted]');
    expect(message).toContain('[path redacted]');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('abc123');
    expect(message).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(message).not.toContain('\u001b');
    expect(message).not.toContain('\u0007');
  });

  it('caps long diagnostics to a small visible length after sanitization', () => {
    const message = sanitizeMessage(`first line\n${'x'.repeat(500)}`);

    expect(message.length).toBeLessThanOrEqual(320);
    expect(message).toContain('...');
  });

  it('preserves truncation while still hiding raw command tails', () => {
    const longCommand = `python train.py --token=supersecret ${'x'.repeat(120)} hidden-tail-marker`;

    expect(formatCommand(longCommand)).toHaveLength(96);
    expect(formatCommand(longCommand)).toContain('...');
    expect(formatCommand(longCommand)).not.toContain('supersecret');
    expect(formatCommand(longCommand)).not.toContain('hidden-tail-marker');
  });

  it('redacts a full drawer command without diagnostic or preview truncation', () => {
    const longCommand = `python train.py --token=supersecret --identity /Users/alice/.ssh/id_ed25519 ${'x'.repeat(340)} -----BEGIN OPENSSH PRIVATE KEY-----\nprivate-material\n-----END OPENSSH PRIVATE KEY----- safe-drawer-tail-marker`;

    const command = formatDrawerCommand(longCommand);

    expect(command).toContain('--token=[redacted]');
    expect(command).toContain('[path redacted]');
    expect(command).toContain('[private key redacted]');
    expect(command).toContain('safe-drawer-tail-marker');
    expect(command).not.toContain('supersecret');
    expect(command).not.toContain('/Users/alice/.ssh/id_ed25519');
    expect(command).not.toContain('private-material');
  });
});
