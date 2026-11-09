import init, { dispatch } from './pkg/wisp.js';
import wasmUrl from './pkg/wisp_bg.wasm?url';

// Only Rust interprets Wisp. Each request has a disposable worker and a host deadline.
self.onmessage = async (event: MessageEvent<{ id: number; request: unknown }>) => {
  const { id, request } = event.data;
  try {
    await init({ module_or_path: wasmUrl });
    self.postMessage({ id, report: JSON.parse(dispatch(JSON.stringify(request))) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
