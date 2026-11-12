export interface RecordingEnvironment {
  id: string;
  name: string;
}

export interface SavedRecording {
  id: string;
  uri: string;
  fileName: string;
  mimeType: 'audio/mp4';
  durationMs: number;
  sizeBytes: number;
  createdAt: string;
  title: string;
  environment: RecordingEnvironment;
}

export interface RecordingSnapshot {
  status:
    | 'idle'
    | 'requesting'
    | 'recording'
    | 'paused'
    | 'saving'
    | 'saved'
    | 'permissionDenied'
    | 'error'
    | 'interrupted';
  durationMs: number;
  metering: number[];
  message?: string;
  canAskAgain?: boolean;
}

export type RecordingStatus = RecordingSnapshot['status'];

export interface RecordingAdapter {
  requestPermission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  prepare(): Promise<void>;
  record(): void;
  pause(): void;
  getState(): {
    durationMs: number;
    isRecording: boolean;
    canRecord: boolean;
    metering?: number;
  };
  stop(): Promise<{ uri: string; durationMs: number }>;
  cleanup(): Promise<void>;
  onFailure(listener: () => void): void;
}

export interface RecordingStorage {
  save(
    uri: string,
    durationMs: number,
    title: string,
    environment: RecordingEnvironment,
  ): Promise<SavedRecording>;
  remove(id: string): Promise<void>;
}

const initialSnapshot = (): RecordingSnapshot => ({
  status: 'idle',
  durationMs: 0,
  metering: [],
});

/** Serializes native operations; cancellation invalidates work already awaiting the OS. */
export class RecordingSession {
  private snapshot = initialSnapshot();
  private listeners = new Set<() => void>();
  private active: Promise<unknown> = Promise.resolve();
  private busy = false;
  private cancelled = false;
  private disposed = false;
  private cancelling = false;
  private cancellationVersion = 0;
  private uncommittedId: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private foreground = true;
  private awaitingPermission = false;
  private wakeForegroundWait: (() => void) | undefined;

  constructor(
    private adapter: RecordingAdapter,
    private storage: RecordingStorage,
  ) {
    adapter.onFailure(() => {
      if (this.snapshot.status === 'recording' || this.snapshot.status === 'paused') {
        void this.interrupt();
      }
    });
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setAppForeground(foreground: boolean) {
    this.foreground = foreground;
    if (foreground) this.wakeForegroundWait?.();
    else if (!this.awaitingPermission) void this.interrupt();
  }

  private update(snapshot: RecordingSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private stopSampling() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private sample = () => {
    if (this.snapshot.status !== 'recording') return;
    try {
      const state = this.adapter.getState();
      if (!state.isRecording || !state.canRecord) {
        void this.interrupt();
        return;
      }
      const metering = Number.isFinite(state.metering)
        ? [...this.snapshot.metering, state.metering as number].slice(-28)
        : this.snapshot.metering;
      this.update({ ...this.snapshot, durationMs: state.durationMs, metering });
    } catch {
      void this.interrupt();
    }
  };

  private run<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (this.busy || this.cancelling || this.disposed) return Promise.resolve(fallback);
    this.busy = true;
    const result = operation().finally(() => {
      this.busy = false;
    });
    this.active = result;
    return result;
  }

  private async removeUncommitted() {
    if (!this.uncommittedId) return;
    await this.storage.remove(this.uncommittedId);
    this.uncommittedId = null;
  }

  private async fail(message: string) {
    this.stopSampling();
    let cleanupFailed = false;
    try {
      await this.adapter.cleanup();
      await this.removeUncommitted();
    } catch {
      cleanupFailed = true;
    }
    if (!this.cancelled) {
      this.update({
        ...this.snapshot,
        status: 'error',
        message: cleanupFailed ? `${message} 임시 파일 정리를 완료하지 못했어요.` : message,
      });
    }
  }

  start = () =>
    this.run(async () => {
      if (['recording', 'paused', 'saved', 'saving'].includes(this.snapshot.status)) return;
      this.cancelled = false;
      this.update({ ...initialSnapshot(), status: 'requesting' });
      try {
        await this.adapter.cleanup();
        await this.removeUncommitted();
        if (this.cancelled) return;
        // Android's permission activity temporarily backgrounds the app. Its result
        // can arrive before the recording screen returns to the foreground.
        this.awaitingPermission = true;
        let permission: Awaited<ReturnType<RecordingAdapter['requestPermission']>>;
        try {
          permission = await this.adapter.requestPermission();
          while (permission.granted && !this.foreground && !this.cancelled) {
            await new Promise<void>((resolve) => {
              this.wakeForegroundWait = resolve;
            });
          }
        } finally {
          this.awaitingPermission = false;
          this.wakeForegroundWait = undefined;
        }
        if (this.cancelled) return;
        if (!permission.granted) {
          this.update({
            ...initialSnapshot(),
            status: 'permissionDenied',
            canAskAgain: permission.canAskAgain,
            message: '절차 설명을 녹음하려면 마이크 권한이 필요해요.',
          });
          return;
        }
        await this.adapter.prepare();
        if (this.cancelled) return;
        this.adapter.record();
        if (!this.adapter.getState().isRecording) throw new Error('Recorder did not start');
        this.update({ ...initialSnapshot(), status: 'recording' });
        this.timer = setInterval(this.sample, 200);
      } catch {
        await this.fail('녹음을 시작하지 못했어요. 마이크를 확인하고 다시 시도해 주세요.');
      }
    }, undefined);

  pause = () =>
    this.run(async () => {
      if (this.snapshot.status !== 'recording') return;
      try {
        this.adapter.pause();
        const state = this.adapter.getState();
        if (state.isRecording || !state.canRecord) throw new Error('Recorder did not pause');
        this.stopSampling();
        this.update({ ...this.snapshot, status: 'paused', durationMs: state.durationMs });
      } catch {
        await this.fail('녹음을 일시정지하지 못했어요. 다시 녹음해 주세요.');
      }
    }, undefined);

  resume = () =>
    this.run(async () => {
      if (this.snapshot.status !== 'paused') return;
      try {
        this.adapter.record();
        if (!this.adapter.getState().isRecording) throw new Error('Recorder did not resume');
        this.update({ ...this.snapshot, status: 'recording' });
        this.timer = setInterval(this.sample, 200);
      } catch {
        await this.fail('녹음을 재개하지 못했어요. 다시 녹음해 주세요.');
      }
    }, undefined);

  finish = (title: string, environment: RecordingEnvironment): Promise<SavedRecording | null> =>
    this.run(async () => {
      if (!['recording', 'paused'].includes(this.snapshot.status) || !title.trim()) return null;
      this.stopSampling();
      this.update({ ...this.snapshot, status: 'saving' });
      let saved: SavedRecording | null = null;
      try {
        const result = await this.adapter.stop();
        if (this.cancelled) return null;
        if (!result.uri || !Number.isFinite(result.durationMs) || result.durationMs <= 0) {
          throw new Error('Recording is empty');
        }
        saved = await this.storage.save(result.uri, result.durationMs, title.trim(), environment);
        this.uncommittedId = saved.id;
        if (this.cancelled) {
          await this.removeUncommitted();
          return null;
        }
        await this.adapter.cleanup();
        if (this.cancelled) {
          await this.removeUncommitted();
          return null;
        }
        this.uncommittedId = null;
        this.update({
          ...this.snapshot,
          status: 'saved',
          durationMs: saved.durationMs,
        });
        return saved;
      } catch {
        if (saved) {
          try {
            await this.removeUncommitted();
          } catch {
            this.update({
              ...this.snapshot,
              status: 'error',
              message: '저장 중단 후 파일을 정리하지 못했어요.',
            });
          }
        }
        await this.fail('녹음을 저장하지 못했어요. 다시 녹음해 주세요.');
        return null;
      }
    }, null);

  private cancel(status: 'idle' | 'interrupted'): Promise<void> {
    this.cancelled = true;
    this.wakeForegroundWait?.();
    this.cancelling = true;
    const version = ++this.cancellationVersion;
    this.stopSampling();
    const pending = this.active;
    const cleanup = pending
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.adapter.cleanup();
          await this.removeUncommitted();
          if (this.snapshot.status !== 'saved') {
            this.update({
              ...initialSnapshot(),
              status,
              message:
                status === 'interrupted'
                  ? '앱 또는 마이크 사용이 중단되어 녹음을 종료했어요. 다시 녹음해 주세요.'
                  : undefined,
            });
          }
        } catch {
          this.update({
            ...this.snapshot,
            status: 'error',
            message: '녹음 자원 또는 임시 파일을 정리하지 못했어요. 다시 시도해 주세요.',
          });
        }
      });
    const result = cleanup.finally(() => {
      if (version === this.cancellationVersion) this.cancelling = false;
    });
    this.active = result;
    return result;
  }

  discard = () => this.cancel('idle');
  interrupt = () =>
    ['requesting', 'recording', 'paused', 'saving'].includes(this.snapshot.status)
      ? this.cancel('interrupted')
      : Promise.resolve();

  dispose = async () => {
    this.disposed = true;
    await this.cancel('idle');
    this.listeners.clear();
  };
}
