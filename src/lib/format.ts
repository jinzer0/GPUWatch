const unknownText = 'unknown';
const diagnosticCap = 320;
const commandPreviewCap = 96;
const secretAssignmentPattern = /((?:--?)?(?:access[-_]?token|api[-_]?key|token|password|secret|key))[ \t]*[=:][ \t]*(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s\r\n]+)/gi;
const secretPhrasePattern = /((?:--?)?(?:access[-_]?token|api[-_]?key|token|password|secret)|--?key)[ \t]+(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\r\n]*?)(?=[ \t]+--?[A-Za-z][\w-]*(?:[ \t]|[=:]|$)|[ \t]*(?:&&|\|\||[;|])|$)/gim;

const sanitizeSensitiveText = (value: string) =>
  value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/(?:~|(?:\b[A-Za-z]:)?\/)(?:[^\s]+\/)*(?:\.ssh|\.gnupg)\/[^\s]+|(?:\b[A-Za-z]:)?\/?(?:[\w.-]+\/)+(?:id_[\w.-]+|[^\s]+\.(?:pem|key))\b/g, '[path redacted]')
    .replace(secretAssignmentPattern, '$1=[redacted]')
    .replace(secretPhrasePattern, '$1=[redacted]')
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, '[private key redacted]')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

const truncateText = (value: string, cap: number) => (value.length > cap ? `${value.slice(0, cap - 3)}...` : value);

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
  return truncateText(sanitizeSensitiveText(value), diagnosticCap);
};

export const formatCommand = (value: string | null | undefined) => {
  if (!value) {
    return unknownText;
  }
  const sanitized = truncateText(sanitizeSensitiveText(value), diagnosticCap);
  return truncateText(sanitized, commandPreviewCap);
};

export const formatDrawerCommand = (value: string | null | undefined) =>
  !value ? unknownText : sanitizeSensitiveText(value);
