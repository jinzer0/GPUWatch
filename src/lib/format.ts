const unknownText = 'unknown';
const diagnosticCap = 320;

export const formatUnknown = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return unknownText;
  }
  return String(value);
};

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return unknownText;
  }
  return `${value.toFixed(1)}%`;
};

export const formatMiB = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return unknownText;
  }
  return `${value.toLocaleString()} MiB`;
};

export const formatKiBPerSecond = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return unknownText;
  }
  return `${value.toLocaleString()} KiB/s`;
};

export const formatRuntimeSeconds = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return unknownText;
  }

  const totalSeconds = Math.trunc(value);
  const hours = Math.trunc(totalSeconds / 3600);
  const minutes = Math.trunc((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

export const formatTemperature = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return unknownText;
  }
  return `${value.toFixed(1)} C`;
};

export const formatWatts = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return unknownText;
  }
  return `${value.toFixed(1)} W`;
};

export const formatTime = (value: string | null | undefined) => {
  if (!value) {
    return unknownText;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

export const sanitizeMessage = (value: string | null | undefined) => {
  if (!value) {
    return unknownText;
  }
  const sanitized = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, '[private key redacted]')
    .replace(/(?:~|(?:\b[A-Za-z]:)?\/)(?:[^\s]+\/)*(?:\.ssh|\.gnupg)\/[^\s]+|(?:\b[A-Za-z]:)?\/?(?:[\w.-]+\/)+(?:id_[\w.-]+|[^\s]+\.(?:pem|key))\b/g, '[path redacted]')
    .replace(/((?:--?)?(?:access-token|api-key|token|password|secret|key))(?:\s*[=:]\s*|\s+)\S+/gi, '$1=[redacted]')
    .replace('[private key=[redacted]', '[private key redacted]')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return sanitized.length > diagnosticCap ? `${sanitized.slice(0, diagnosticCap - 3)}...` : sanitized;
};

export const formatCommand = (value: string | null | undefined) => {
  const sanitized = sanitizeMessage(value);
  if (sanitized === unknownText) {
    return sanitized;
  }
  const redacted = sanitized.replace(/\b(token|password|secret|api[-_]?key|access[-_]?token)(?:\s*[=:]\s*|\s+)\S+/gi, '$1=[redacted]');
  return redacted.length > 96 ? `${redacted.slice(0, 93)}...` : redacted;
};
