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
    .replace(/\b[A-Za-z]:?\/?(?:[\w.-]+\/)+(?:id_[\w.-]+|[^\s]+\.pem)\b/g, '[path redacted]')
    .replace(/(?:--?(?:token|password|secret|key|api-key|access-token)=)(\S+)/gi, '$1[redacted]');
};

export const formatCommand = (value: string | null | undefined) => {
  const sanitized = sanitizeMessage(value);
  if (sanitized === unknownText) {
    return sanitized;
  }
  const redacted = sanitized.replace(/(token|password|secret|api[-_]?key|access[-_]?token)[=:\s]+\S+/gi, '$1=[redacted]');
  return redacted.length > 96 ? `${redacted.slice(0, 93)}...` : redacted;
};
