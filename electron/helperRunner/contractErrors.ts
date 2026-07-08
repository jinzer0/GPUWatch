import type { HelperResponseEnvelope } from '../helperContract.js';

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
