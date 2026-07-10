import { describe, expect, it } from 'vitest';

import {
  formatCommand,
  formatKiBPerSecond,
  formatMiB,
  formatPercent,
  formatRuntimeSeconds,
  formatTemperature,
  formatUnknown,
  formatWatts,
  sanitizeMessage
} from './format';

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
});
