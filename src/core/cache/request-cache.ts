interface RequestCacheEntry<T> {
  controller: AbortController;
  users: number;
  ready: boolean;
  promise: Promise<T>;
}

export interface RequestCache<T> {
  get(key: string, signal?: AbortSignal): Promise<T>;
}

export function createRequestCache<T>(fetcher: (key: string, signal: AbortSignal) => Promise<T>): RequestCache<T> {
  const entries = new Map<string, RequestCacheEntry<T>>();
  return {
    get(key: string, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
      let entry = entries.get(key);
      if (!entry) {
        const controller = new AbortController();
        const pending: RequestCacheEntry<T> = {
          controller,
          users: 0,
          ready: false,
          promise: Promise.resolve()
            .then(() => fetcher(key, controller.signal))
            .then((value) => {
              pending.ready = true;
              return value;
            })
            .catch((error) => {
              if (entries.get(key) === pending) entries.delete(key);
              throw error;
            }),
        };
        entry = pending;
        entries.set(key, entry);
      }
      entry.users++;
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", abort);
          entry!.users--;
        };
        const abort = () => {
          cleanup();
          reject(new DOMException("Aborted", "AbortError"));
          if (!entry!.ready && entry!.users === 0) {
            if (entries.get(key) === entry) entries.delete(key);
            entry!.controller.abort();
          }
        };
        signal?.addEventListener("abort", abort, { once: true });
        entry!.promise.then(
          (value) => {
            cleanup();
            resolve(value);
          },
          (error) => {
            cleanup();
            reject(error);
          },
        );
      });
    },
  };
}
