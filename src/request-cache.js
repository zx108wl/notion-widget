export function createRequestCache(fetcher) {
  const entries = new Map();
  return { get(key, signal) {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    let entry = entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, users: 0, ready: false };
      entry.promise = Promise.resolve().then(() => fetcher(key, controller.signal)).then(value => { entry.ready = true; return value; }).catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
      entries.set(key, entry);
    }
    entry.users++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true; signal?.removeEventListener("abort", abort); entry.users--; callback(value);
      };
      const abort = () => {
        finish(reject, new DOMException("Aborted", "AbortError"));
        if (!entry.ready && entry.users === 0) { if (entries.get(key) === entry) entries.delete(key); entry.controller.abort(); }
      };
      signal?.addEventListener("abort", abort, { once: true });
      entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  } };
}
