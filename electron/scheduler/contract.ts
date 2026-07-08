import { helperContract, type HelperAction, type HelperRequestEnvelope, type HelperResponseEnvelope } from '../helperContract.js';

export function contractError(type: string, message: string): HelperResponseEnvelope<never> {
  return {
    ok: false,
    error: {
      layer: 'helper_contract',
      type,
      message
    }
  };
}

export function contractEntry(action: HelperAction) {
  return helperContract.find((entry) => entry.helperAction === action);
}

export function isSuccess<Data>(response: HelperResponseEnvelope<Data>): response is { ok: true; data: Data } {
  return response.ok;
}

export function serverOverlapId(request: HelperRequestEnvelope<HelperAction, object>): string | null {
  const payload = request.payload as Record<string, unknown>;
  const directId = payload.id;
  if (typeof directId === 'string' && directId.trim().length > 0) {
    return directId;
  }

  const serverId = payload.serverId;
  if (typeof serverId === 'string' && serverId.trim().length > 0) {
    return serverId;
  }

  const input = payload.input;
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const inputId = (input as Record<string, unknown>).id;
    if (typeof inputId === 'string' && inputId.trim().length > 0) {
      return inputId;
    }
  }

  return null;
}

export function isNetworkServerAction(action: HelperAction): boolean {
  return action === 'test_connection' || action === 'refresh_server';
}

export function isSerializedShortDbMutation(action: HelperAction): boolean {
  const entry = contractEntry(action);
  return entry?.dbMutation !== undefined && entry.dbMutation !== 'none' && entry.dbMutation !== 'poll-health-start-and-result-write';
}
