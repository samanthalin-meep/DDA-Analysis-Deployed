type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export class AnalysisWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private loadingTimer: ReturnType<typeof setTimeout> | undefined;
  private initialized = false;

  constructor(
    private createWorker: () => Worker,
    private onProgress: (label: string, value: number) => void,
    private onReset: () => void,
    private loadingTimeoutMs = 120_000,
  ) {}

  private loaded() {
    clearTimeout(this.loadingTimer);
    this.loadingTimer = undefined;
  }

  private reset(error: Error) {
    this.loaded();
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    for (const item of this.pending.values()) item.reject(error);
    this.pending.clear();
    this.onReset();
  }

  private getWorker() {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    this.loadingTimer = setTimeout(() => this.reset(Error(
      "Analysis tools did not finish loading within two minutes. Check that the website is available, then retry.",
    )), this.loadingTimeoutMs);
    worker.onmessage = (event) => {
      if (this.worker !== worker) return;
      const message = event.data;
      if (message.type === "ready") {
        this.loaded();
        this.initialized = true;
        return;
      }
      if (message.type === "progress") {
        this.onProgress(message.label, message.value);
        return;
      }
      if (message.error && !this.initialized) {
        this.reset(Error(message.error));
        return;
      }
      // A response also ends initialization for compatible older workers.
      this.loaded();
      this.initialized = true;
      const item = this.pending.get(message.id);
      if (item) {
        this.pending.delete(message.id);
        if (message.error) item.reject(Error(message.error));
        else item.resolve(message.result);
      }
    };
    worker.onerror = (event) => {
      if (this.worker === worker)
        this.reset(Error(event.message || "The analysis tools stopped loading. Retry the operation."));
    };
    worker.onmessageerror = () => {
      if (this.worker === worker)
        this.reset(Error("The analysis tools returned an unreadable response. Retry the operation."));
    };
    return worker;
  }

  request<T>(action: string, payload: any = {}, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.getWorker().postMessage({ id, action, payload }, transfer);
      } catch (error) {
        this.reset(error instanceof Error ? error : Error(String(error)));
      }
    });
  }

  cancel() {
    this.reset(Error("Canceled."));
  }
}
