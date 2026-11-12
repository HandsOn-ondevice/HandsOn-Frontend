import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { RecordingSession, type RecordingAdapter } from './recordingSession';
import {
  cleanupAbandonedRecordings,
  deleteSavedRecording,
  saveRecording,
} from './recordingStorage';

class NativeRecordingAdapter implements RecordingAdapter {
  private recorder: AudioRecorder | null = null;
  private subscription: { remove(): void } | undefined;
  private failureListener: () => void = () => undefined;
  private completion: { resolve(uri: string): void; reject(error: Error): void } | undefined;
  private temporaryUri: string | null = null;
  private audioConfigured = false;

  onFailure(listener: () => void) {
    this.failureListener = listener;
  }

  async requestPermission() {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      throw new Error('Native recording is only supported on Android and iOS');
    }
    const current = await AudioModule.getRecordingPermissionsAsync();
    return current.granted || !current.canAskAgain
      ? current
      : AudioModule.requestRecordingPermissionsAsync();
  }

  async prepare() {
    await cleanupAbandonedRecordings();
    this.audioConfigured = true;
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsBackgroundRecording: false,
      interruptionMode: 'doNotMix',
    });
    const preset = RecordingPresets.HIGH_QUALITY;
    // The native constructor accepts flattened options, unlike useAudioRecorder's public preset.
    const options = {
      ...preset,
      ...(Platform.OS === 'ios' ? preset.ios : preset.android),
      numberOfChannels: 1,
      isMeteringEnabled: true,
      directory: 'cache' as const,
      fileName: `handson-pending-${Date.now()}`,
    };
    const nativeAudio = AudioModule;
    const recorder = new nativeAudio.AudioRecorder(options);
    this.recorder = recorder;
    this.subscription = recorder.addListener('recordingStatusUpdate', (status) => {
      if (status.hasError || status.mediaServicesDidReset) {
        this.completion?.reject(new Error(status.error ?? 'Recording failed'));
        this.failureListener();
      } else if (status.isFinished) {
        if (this.completion && status.url) this.completion.resolve(status.url);
        else this.failureListener();
      }
    });
    await recorder.prepareToRecordAsync();
    this.temporaryUri = recorder.uri;
  }

  private requireRecorder() {
    if (!this.recorder) throw new Error('Recording is not prepared');
    return this.recorder;
  }

  record() {
    this.requireRecorder().record();
  }

  pause() {
    this.requireRecorder().pause();
  }

  getState() {
    const status = this.requireRecorder().getStatus();
    return {
      durationMs: status.durationMillis,
      isRecording: status.isRecording,
      canRecord: status.canRecord,
      metering: status.metering,
    };
  }

  async stop() {
    const recorder = this.requireRecorder();
    const durationMs = recorder.getStatus().durationMillis;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const completion = new Promise<string>((resolve, reject) => {
      this.completion = { resolve, reject };
      timer = setTimeout(() => reject(new Error('Recording completion timed out')), 5000);
    });
    // Attach a rejection handler immediately in case the native error event precedes stop().
    const outcome = completion.then(
      (uri) => ({ uri }),
      (error: unknown) => ({ error }),
    );
    try {
      await recorder.stop();
      const result = await outcome;
      if ('error' in result) throw result.error;
      return { uri: result.uri, durationMs };
    } finally {
      clearTimeout(timer);
      this.completion = undefined;
    }
  }

  async cleanup() {
    const recorder = this.recorder;
    const uri = this.temporaryUri || recorder?.uri;
    this.recorder = null;
    this.temporaryUri = uri || null;
    this.subscription?.remove();
    this.subscription = undefined;
    try {
      recorder?.release();
    } finally {
      try {
        if (uri) {
          const file = new File(uri);
          if (file.exists) file.delete();
        }
        this.temporaryUri = null;
      } finally {
        if (this.audioConfigured) {
          await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false });
          this.audioConfigured = false;
        }
      }
    }
  }
}

export function createRecordingSession() {
  return new RecordingSession(new NativeRecordingAdapter(), {
    save: saveRecording,
    remove: deleteSavedRecording,
  });
}
