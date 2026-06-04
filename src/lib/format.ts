const unknownText = 'unknown';

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
  return value
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, '[private key redacted]')
    .replace(/(?:\b[A-Za-z]:)?\/?(?:[\w.-]+\/)+(?:id_[\w.-]+|[^\s]+\.pem)\b/g, '[path redacted]')
    .replace(/(--?(?:token|password|secret|key|api-key|access-token))(?:=|\s+)\S+/gi, '$1=[redacted]');
};

export const formatCommand = (value: string | null | undefined) => {
  const sanitized = sanitizeMessage(value);
  if (sanitized === unknownText) {
    return sanitized;
  }
  const redacted = sanitized.replace(/\b(token|password|secret|api[-_]?key|access[-_]?token)[=:\s]+\S+/gi, '$1=[redacted]');
  return redacted.length > 96 ? `${redacted.slice(0, 93)}...` : redacted;
};
