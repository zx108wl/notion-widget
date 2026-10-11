export interface WidgetRenderOptions {
  signal: AbortSignal;
}

export interface WidgetUpdateOptions {
  signal: AbortSignal;
  lifetimeSignal: AbortSignal;
}

export interface WidgetInstance {
  update?: (config: Record<string, string>, options: WidgetUpdateOptions) => Promise<void> | void;
  destroy?: () => void;
}

export type WidgetRenderFn = (
  root: Element,
  config: Record<string, string>,
  options: WidgetRenderOptions,
) => WidgetInstance | (() => void) | Promise<WidgetInstance | (() => void)>;

export interface WidgetModule {
  render: WidgetRenderFn;
}

export interface WidgetRuntimeOptions {
  root: Element;
  loadModule: () => Promise<WidgetModule>;
  validate: (config: Record<string, string>) => { reason: string }[];
  showErrors: (errors: { reason: string }[]) => void;
  showFailure: (error: Error) => void;
}

export interface WidgetRuntime {
  render: (config: Record<string, string>) => Promise<void>;
  destroy: () => void;
}

export function createWidgetRuntime(options: WidgetRuntimeOptions): WidgetRuntime {
  const { root, loadModule, validate, showErrors, showFailure } = options;
  let version = 0;
  let controller: AbortController | undefined;
  let updateController: AbortController | undefined;
  let instance: WidgetInstance | (() => void) | null = null;
  let disposed = false;
  let updateQueue: Promise<void> = Promise.resolve();

  const clear = () => {
    controller?.abort();
    updateController?.abort();
    try {
      if (typeof instance === "function") instance();
      else instance?.destroy?.();
    } catch (error) {
      console.error(error);
    }
    instance = null;
    updateQueue = Promise.resolve();
  };

  return {
    async render(config: Record<string, string>): Promise<void> {
      if (disposed) return;
      const current = ++version;
      const errors = validate(config);
      if (errors.length) {
        clear();
        showErrors(errors);
        return;
      }
      const inst = typeof instance === "function" ? null : instance;
      if (inst?.update) {
        updateController?.abort();
        const nextUpdate = new AbortController();
        updateController = nextUpdate;
        const target = inst;
        updateQueue = updateQueue.then(async () => {
          if (disposed || current !== version || nextUpdate.signal.aborted || instance !== target) return;
          try {
            await target.update!(config, { signal: nextUpdate.signal, lifetimeSignal: controller!.signal });
          } catch (error) {
            if (!nextUpdate.signal.aborted && current === version) {
              clear();
              showFailure(error as Error);
            }
          }
        });
        await updateQueue;
        return;
      }
      clear();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const module = await loadModule();
        if (signal.aborted || disposed || current !== version) return;
        const result = await module.render(root, config, { signal });
        if (signal.aborted || disposed || current !== version) {
          if (typeof result === "function") result();
          else result?.destroy?.();
          return;
        }
        instance = result;
      } catch (error) {
        if (!signal.aborted && current === version) {
          clear();
          showFailure(error as Error);
        }
      }
    },
    destroy() {
      disposed = true;
      version++;
      clear();
      root.replaceChildren();
    },
  };
}
