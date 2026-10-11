export function createWidgetRuntime({ root, loadModule, validate, showErrors, showFailure }) {
  let version = 0, controller, updateController, instance, disposed = false;
  let updateQueue = Promise.resolve();
  const clear = () => {
    controller?.abort(); updateController?.abort();
    try { if (typeof instance === "function") instance(); else instance?.destroy?.(); } catch (error) { console.error(error); }
    instance = null; updateQueue = Promise.resolve();
  };
  return {
    async render(config) {
      if (disposed) return;
      const current = ++version;
      const errors = validate(config);
      if (errors.length) { clear(); showErrors(errors); return; }
      if (instance?.update) {
        updateController?.abort();
        const nextUpdate = new AbortController(); updateController = nextUpdate;
        const target = instance;
        updateQueue = updateQueue.then(async () => {
          if (disposed || current !== version || nextUpdate.signal.aborted || instance !== target) return;
          try { await target.update(config, { signal: nextUpdate.signal, lifetimeSignal: controller.signal }); }
          catch (error) { if (!nextUpdate.signal.aborted && current === version) { clear(); showFailure(error); } }
        });
        await updateQueue;
        return;
      }
      clear(); controller = new AbortController(); const signal = controller.signal;
      try {
        const module = await loadModule();
        if (signal.aborted || disposed || current !== version) return;
        const result = await module.render(root, config, { signal });
        if (signal.aborted || disposed || current !== version) { if (typeof result === "function") result(); else result?.destroy?.(); return; }
        instance = result;
      } catch (error) { if (!signal.aborted && current === version) { clear(); showFailure(error); } }
    },
    destroy() { disposed = true; version++; clear(); root.replaceChildren(); },
  };
}
