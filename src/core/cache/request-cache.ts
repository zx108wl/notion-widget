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
        entry = { controller, users: 0, ready: false } as RequestCacheEntry<T>;
        entry.promise = Promise.resolve()
          .then(() => fetcher(key, controller.signal))
          .then((value) => {
            entry!.ready = true;
            return value;
          })
          .catch((error) => {
            if (entries.get(key) === entry) entries.delete(key);
            throw error;
          });
        entries.set(key, entry);
      }
      entry.users++;
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (callback: (value: T | Error) => void, value: T | Error) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", abort);
          entry!.users--;
          callback(value);
        };
        const abort = () => {
          finish(reject as (value: T | Error) => void, new DOMException("Aborted", "AbortError"));
          if (!entry!.ready && entry!.users === 0) {
            if (entries.get(key) === entry) entries.delete(key);
            entry!.controller.abort();
          }
        };
        signal?.addEventListener("abort", abort, { once: true });
        entry!.promise.then(
          (value) => finish(resolve as (value: T | Error) => void, value),
          (error) => finish(reject as (value: T | Error) => void, error),
        );
      });
    },
  };
}
