export function createAsyncCache() {
  const pending = new Map();
  return { get(key, factory) {
    if (!pending.has(key)) {
      const promise = Promise.resolve().then(factory).catch(error => { if (pending.get(key) === promise) pending.delete(key); throw error; });
      pending.set(key, promise);
    }
    return pending.get(key);
  } };
}
