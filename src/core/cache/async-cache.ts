export interface AsyncCache {
  get<T>(key: string, factory: () => Promise<T>): Promise<T>;
}

export function createAsyncCache(): AsyncCache {
  const pending = new Map<string, Promise<unknown>>();
  return {
    get<T>(key: string, factory: () => Promise<T>): Promise<T> {
      if (!pending.has(key)) {
        const promise = Promise.resolve()
          .then(factory)
          .catch((error) => {
            if (pending.get(key) === promise) pending.delete(key);
            throw error;
          });
        pending.set(key, promise);
      }
      return pending.get(key) as Promise<T>;
    },
  };
}
