type BridgeResponse<Data> = { readonly ok: true; readonly data: Data };

export type GpuWatcherBridge = NonNullable<Window['gpuwatcher']>;

export const okBridgeResponse = <Data>(data: Data): BridgeResponse<Data> => ({ ok: true, data });

export const clearGpuWatcherBridge = () => {
  delete window.gpuwatcher;
};

export const setGpuWatcherBridge = (bridge: Partial<GpuWatcherBridge>) => {
  window.gpuwatcher = bridge;
  return bridge;
};
