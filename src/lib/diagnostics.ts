import { sanitizeMessage } from './format';

export const knownDiagnosticErrorTypes = [
  'ssh_auth_failed',
  'ssh_host_key_failed',
  'ssh_timeout',
  'ssh_unreachable',
  'nvidia_smi_missing',
  'remote_gpu_query_failed',
  'remote_output_malformed',
  'remote_command_failed',
  'backend_unavailable'
] as const;

export type KnownDiagnosticErrorType = (typeof knownDiagnosticErrorTypes)[number];

export type DiagnosticInput = {
  readonly errorType: string | null | undefined;
  readonly message: string | null | undefined;
};

export type DiagnosticDisplay = {
  readonly errorType: KnownDiagnosticErrorType | 'unknown';
  readonly label: string;
  readonly message: string;
  readonly guidance: string;
};

type DiagnosticCopy = {
  readonly label: string;
  readonly guidance: string;
};

const unknownDiagnosticCopy = {
  label: 'Unknown diagnostic',
  guidance: 'Review the sanitized error message, then retry from the desktop app after checking the saved server connection settings.'
} as const satisfies DiagnosticCopy;

const diagnosticCopyByType = {
  ssh_auth_failed: {
    label: 'SSH authentication failed',
    guidance: 'Confirm the SSH key path, unlock the key in ssh-agent, and verify the remote account can log in noninteractively from macOS.'
  },
  ssh_host_key_failed: {
    label: 'SSH host key check failed',
    guidance: 'Resolve the host key entry in known_hosts from Terminal, then retry after the host trust prompt no longer requires interaction.'
  },
  ssh_timeout: {
    label: 'SSH connection timed out',
    guidance: 'Check the host, port, DNS, VPN, firewall, and network reachability from macOS, then retry the connection test.'
  },
  ssh_unreachable: {
    label: 'SSH host unreachable',
    guidance: 'Verify DNS, routing, firewall rules, host availability, SSH port, and remote account permissions from macOS Terminal.'
  },
  nvidia_smi_missing: {
    label: 'nvidia-smi unavailable',
    guidance: 'Confirm the NVIDIA driver is installed, nvidia-smi is available on PATH for noninteractive SSH sessions, and the remote user can run it.'
  },
  remote_gpu_query_failed: {
    label: 'Remote GPU query failed',
    guidance: 'Confirm nvidia-smi works for the remote user, the NVIDIA driver is healthy, and account permissions allow reading GPU device state.'
  },
  remote_output_malformed: {
    label: 'Remote GPU output malformed',
    guidance: 'Retry the refresh and inspect the sanitized message for unexpected nvidia-smi output, shell startup text, or driver response changes.'
  },
  remote_command_failed: {
    label: 'Remote command failed',
    guidance: 'Confirm key-based SSH works, required commands are available on PATH, and the remote account can run nvidia-smi and ps noninteractively.'
  },
  backend_unavailable: {
    label: 'Desktop backend unavailable',
    guidance: 'Launch GPUWatcher as the Electron desktop app, then retry actions that require the local helper and preload bridge.'
  }
} as const satisfies Record<KnownDiagnosticErrorType, DiagnosticCopy>;

function isKnownDiagnosticErrorType(errorType: string | null | undefined): errorType is KnownDiagnosticErrorType {
  return knownDiagnosticErrorTypes.some((knownErrorType) => knownErrorType === errorType);
}

export function formatDiagnostic(input: DiagnosticInput): DiagnosticDisplay {
  const message = sanitizeMessage(input.message);

  if (isKnownDiagnosticErrorType(input.errorType)) {
    const copy = diagnosticCopyByType[input.errorType];
    return {
      errorType: input.errorType,
      label: copy.label,
      message,
      guidance: copy.guidance
    };
  }

  return {
    errorType: 'unknown',
    label: unknownDiagnosticCopy.label,
    message,
    guidance: unknownDiagnosticCopy.guidance
  };
}
