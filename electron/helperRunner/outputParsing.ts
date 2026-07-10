import type { HelperResponseEnvelope } from '../helperContract.js';

const DIAGNOSTIC_CAP = 320;

export function sanitizeDiagnostic(value: string): string {
  const sanitized = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, '[private key redacted]')
    .replace(/(?:~|(?:\b[A-Za-z]:)?\/)(?:[^\s]+\/)*(?:\.ssh|\.gnupg)\/[^\s]+|(?:\b[A-Za-z]:)?\/?(?:[\w.-]+\/)+(?:id_[\w.-]+|[^\s]+\.(?:pem|key))\b/g, '[path redacted]')
    .replace(/((?:--?)?(?:access-token|api-key|token|password|secret|key))(?:=|:|\s+)\S+/gi, '$1=[redacted]')
    .replace('[private key=[redacted]', '[private key redacted]')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return sanitized.length > DIAGNOSTIC_CAP ? `${sanitized.slice(0, DIAGNOSTIC_CAP - 3)}...` : sanitized;
}

export function validateHelperResponse(value: unknown): value is HelperResponseEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true) {
    return 'data' in candidate;
  }

  if (candidate.ok === false && typeof candidate.error === 'object' && candidate.error !== null && !Array.isArray(candidate.error)) {
    const error = candidate.error as Record<string, unknown>;
    return typeof error.layer === 'string' && typeof error.type === 'string' && typeof error.message === 'string';
  }

  return false;
}
