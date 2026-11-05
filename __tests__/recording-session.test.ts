import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  RecordingSession,
  type RecordingAdapter,
  type RecordingStorage,
  type SavedRecording,
} from '../src/features/recording/recordingSession';
import {
  cleanupAbandonedRecordings,
  readSavedRecording,
  saveRecording,
} from '../src/features/recording/recordingStorage';

const environment = { id: 'lab', name: '연구실' };
const saved: SavedRecording = {
  id: 'recording-12345678-abcdefgh',
  uri: 'file:///documents/recordings/recording-12345678-abcdefgh.m4a',
  fileName: 'recording-12345678-abcdefgh.m4a',
  mimeType: 'audio/mp4',
  durationMs: 2400,
  sizeBytes: 24000,
  createdAt: '2026-11-05T00:00:00.000Z',
  title: '절차',
  environment,
};

function setup() {
  let state = { durationMs: 0, isRecording: false, canRecord: true, metering: -40 };
  let failure: () => void = () => undefined;
  const adapter: RecordingAdapter = {
    requestPermission: jest.fn<RecordingAdapter['requestPermission']>().mockResolvedValue({
      granted: true,
      canAskAgain: true,
    }),
    prepare: jest.fn<RecordingAdapter['prepare']>().mockResolvedValue(),
    record: jest.fn(() => {
      state = { ...state, isRecording: true };
    }),
    pause: jest.fn(() => {
      state = { ...state, isRecording: false };
    }),
    getState: jest.fn(() => state),
    stop: jest.fn<RecordingAdapter['stop']>().mockResolvedValue({
      uri: 'file:///cache/original.m4a',
      durationMs: saved.durationMs,
    }),
    cleanup: jest.fn<RecordingAdapter['cleanup']>().mockResolvedValue(),
    onFailure: (listener) => {
      failure = listener;
    },
  };
  const storage: RecordingStorage = {
    save: jest.fn<RecordingStorage['save']>().mockResolvedValue(saved),
    remove: jest.fn<RecordingStorage['remove']>().mockResolvedValue(),
  };
  const session = new RecordingSession(adapter, storage);
  return {
    session,
    adapter,
    storage,
    fail: () => failure(),
    change: (next: Partial<typeof state>) => {
      state = { ...state, ...next };
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

test('마이크 권한 거부는 녹음을 준비하거나 원본을 저장하지 않는다', async () => {
  const { session, adapter, storage } = setup();
  jest.mocked(adapter.requestPermission).mockResolvedValue({ granted: false, canAskAgain: false });
  await session.start();
  expect(session.getSnapshot()).toMatchObject({ status: 'permissionDenied', canAskAgain: false });
  expect(adapter.prepare).not.toHaveBeenCalled();
  expect(await session.finish('절차', environment)).toBeNull();
  expect(storage.save).not.toHaveBeenCalled();
});

test('실제 녹음 시간과 입력 크기를 반영하고 일시정지 시간은 고정한다', async () => {
  const { session, adapter, change } = setup();
  await session.start();
  change({ durationMs: 1700, metering: -21 });
  jest.advanceTimersByTime(200);
  expect(session.getSnapshot()).toMatchObject({ durationMs: 1700, metering: [-21] });
  await session.pause();
  change({ durationMs: 9000 });
  jest.advanceTimersByTime(5000);
  expect(session.getSnapshot()).toMatchObject({ status: 'paused', durationMs: 1700 });
  await session.resume();
  change({ durationMs: 2200 });
  jest.advanceTimersByTime(200);
  expect(session.getSnapshot()).toMatchObject({ status: 'recording', durationMs: 2200 });
  expect(adapter.record).toHaveBeenCalledTimes(2);
  await session.dispose();
});

test('종료한 같은 원본을 저장하고 저장 완료 후 화면을 떠나도 삭제하지 않는다', async () => {
  const { session, adapter, storage } = setup();
  await session.start();
  const result = await session.finish(' 절차 ', environment);
  expect(result).toEqual(saved);
  expect(storage.save).toHaveBeenCalledWith(
    'file:///cache/original.m4a',
    2400,
    '절차',
    environment,
  );
  expect(session.getSnapshot().status).toBe('saved');
  await session.dispose();
  expect(adapter.cleanup).toHaveBeenCalled();
  expect(storage.remove).not.toHaveBeenCalled();
});

test.each(['stop', 'save'] as const)(
  '%s 실패에서는 E03 원본을 반환하지 않는다',
  async (failure) => {
    const { session, adapter, storage } = setup();
    if (failure === 'stop') jest.mocked(adapter.stop).mockRejectedValue(new Error('native stop'));
    else jest.mocked(storage.save).mockRejectedValue(new Error('disk full'));
    await session.start();
    expect(await session.finish('절차', environment)).toBeNull();
    expect(session.getSnapshot().status).toBe('error');
    expect(adapter.cleanup).toHaveBeenCalled();
  },
);

test('빈 원본과 길이가 없는 녹음은 저장하지 않는다', async () => {
  const { session, adapter, storage } = setup();
  jest.mocked(adapter.stop).mockResolvedValue({ uri: '', durationMs: 0 });
  await session.start();
  expect(await session.finish('절차', environment)).toBeNull();
  expect(storage.save).not.toHaveBeenCalled();
  expect(session.getSnapshot().status).toBe('error');
});

test('권한 응답을 기다리다 나가면 이후 허용 응답으로 녹음을 시작하지 않는다', async () => {
  const { session, adapter } = setup();
  const permission = Promise.withResolvers<{ granted: boolean; canAskAgain: boolean }>();
  const requested = Promise.withResolvers<void>();
  jest.mocked(adapter.requestPermission).mockImplementation(() => {
    requested.resolve();
    return permission.promise;
  });
  const starting = session.start();
  await requested.promise;
  const disposed = session.dispose();
  permission.resolve({ granted: true, canAskAgain: true });
  await Promise.all([starting, disposed]);
  expect(adapter.prepare).not.toHaveBeenCalled();
  expect(adapter.record).not.toHaveBeenCalled();
  expect(adapter.cleanup).toHaveBeenCalled();
});

test('네이티브 준비 도중 취소하면 준비 완료 뒤 정리하고 녹음은 시작하지 않는다', async () => {
  const { session, adapter } = setup();
  const preparation = Promise.withResolvers<void>();
  const preparing = Promise.withResolvers<void>();
  jest.mocked(adapter.prepare).mockImplementation(() => {
    preparing.resolve();
    return preparation.promise;
  });
  const starting = session.start();
  await preparing.promise;
  expect(adapter.prepare).toHaveBeenCalled();
  const discarded = session.discard();
  preparation.resolve();
  await Promise.all([starting, discarded]);
  expect(adapter.record).not.toHaveBeenCalled();
  expect(adapter.cleanup).toHaveBeenCalled();
  expect(session.getSnapshot().status).toBe('idle');
});

test('파일 저장 도중 중단하면 나중에 생긴 파일도 삭제하고 성공으로 반환하지 않는다', async () => {
  const { session, storage } = setup();
  const writing = Promise.withResolvers<SavedRecording>();
  jest.mocked(storage.save).mockReturnValue(writing.promise);
  await session.start();
  const finishing = session.finish('절차', environment);
  await Promise.resolve();
  const interrupted = session.interrupt();
  writing.resolve(saved);
  expect(await finishing).toBeNull();
  await interrupted;
  expect(storage.remove).toHaveBeenCalledWith(saved.id);
  expect(session.getSnapshot().status).toBe('interrupted');
});

test('중복 시작과 종료 호출은 네이티브 녹음과 저장을 한 번만 실행한다', async () => {
  const { session, adapter, storage } = setup();
  await Promise.all([session.start(), session.start()]);
  expect(adapter.prepare).toHaveBeenCalledTimes(1);
  await Promise.all([session.finish('절차', environment), session.finish('절차', environment)]);
  expect(adapter.stop).toHaveBeenCalledTimes(1);
  expect(storage.save).toHaveBeenCalledTimes(1);
  await session.dispose();
});

test('시스템이 녹음을 멈추면 중단 상태를 표시하고 임시 자원을 정리한다', async () => {
  const { session, adapter, change } = setup();
  await session.start();
  change({ isRecording: false });
  jest.advanceTimersByTime(200);
  await session.interrupt();
  expect(session.getSnapshot().status).toBe('interrupted');
  expect(adapter.cleanup).toHaveBeenCalled();
});

test('중단 자원 정리 실패는 안내하며 dispose나 interrupt를 reject하지 않는다', async () => {
  const { session, adapter } = setup();
  await session.start();
  jest.mocked(adapter.cleanup).mockRejectedValue(new Error('cleanup failed'));
  await expect(session.interrupt()).resolves.toBeUndefined();
  expect(session.getSnapshot().status).toBe('error');
  await expect(session.dispose()).resolves.toBeUndefined();
});

test('녹음 전과 권한 거부 상태의 focus 변경은 중단 상태를 만들지 않는다', async () => {
  const { session, adapter } = setup();
  await session.interrupt();
  expect(session.getSnapshot().status).toBe('idle');
  expect(adapter.cleanup).not.toHaveBeenCalled();
  jest.mocked(adapter.requestPermission).mockResolvedValue({ granted: false, canAskAgain: false });
  await session.start();
  await session.interrupt();
  expect(session.getSnapshot().status).toBe('permissionDenied');
});

test('저장 중단 후 파일 삭제 실패를 중단 성공으로 덮어쓰지 않는다', async () => {
  const { session, storage } = setup();
  const writing = Promise.withResolvers<SavedRecording>();
  const entered = Promise.withResolvers<void>();
  jest.mocked(storage.save).mockImplementation(() => {
    entered.resolve();
    return writing.promise;
  });
  jest.mocked(storage.remove).mockRejectedValue(new Error('cannot delete'));
  await session.start();
  const finishing = session.finish('절차', environment);
  await entered.promise;
  const interrupted = session.interrupt();
  writing.resolve(saved);
  expect(await finishing).toBeNull();
  await interrupted;
  expect(session.getSnapshot().status).toBe('error');
});

const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...mockFiles.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new File(uri));
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    async text() {
      return mockFiles.get(this.uri) ?? '';
    }
    async write(content: string) {
      mockFiles.set(this.uri, content);
    }
    async copy(destination: File) {
      mockFiles.set(destination.uri, mockFiles.get(this.uri) ?? '');
    }
    async move(destination: File) {
      await this.copy(destination);
      this.delete();
    }
  }
  return { File, Directory, Paths: { document: 'file:///documents', cache: 'file:///cache' } };
});

// Native file IO is injected above; these checks exercise the actual storage gate and metadata.

describe('원본 파일 저장과 E03 경계', () => {
  beforeEach(() => mockFiles.clear());

  test('저장한 원본과 메타데이터를 같은 ID로 다시 조회한다', async () => {
    mockFiles.set('file:///cache/source.m4a', 'encoded-audio');
    const result = await saveRecording('file:///cache/source.m4a', 2400, '절차', environment);
    expect(await readSavedRecording(result.id)).toEqual(result);
    expect(mockFiles.get(result.uri)).toBe('encoded-audio');
  });

  test('존재하지 않거나 비어 있는 파일과 0초 원본은 저장하지 않는다', async () => {
    mockFiles.set('file:///cache/source.m4a', '');
    await expect(
      saveRecording('file:///cache/source.m4a', 2400, '절차', environment),
    ).rejects.toThrow();
    mockFiles.set('file:///cache/source.m4a', 'audio');
    await expect(
      saveRecording('file:///cache/source.m4a', 0, '절차', environment),
    ).rejects.toThrow();
    expect(await readSavedRecording('../../private')).toBeNull();
  });

  test('메타데이터의 경로를 신뢰하지 않고 소유한 디렉터리에서 원본을 찾는다', async () => {
    mockFiles.set(saved.uri, 'a'.repeat(saved.sizeBytes));
    mockFiles.set(
      saved.uri.replace('.m4a', '.json'),
      JSON.stringify({ ...saved, uri: 'file:///evil' }),
    );
    expect((await readSavedRecording(saved.id))?.uri).toBe(saved.uri);
    mockFiles.set(saved.uri, 'truncated');
    expect(await readSavedRecording(saved.id)).toBeNull();
  });

  test('프로세스 중단 후 임시 파일만 정리하고 저장된 원본과 다른 오디오를 보존한다', async () => {
    mockFiles.set('file:///cache/Audio/handson-pending-123.m4a', 'incomplete');
    mockFiles.set('file:///cache/Audio/other.m4a', 'other');
    mockFiles.set(saved.uri, 'saved');
    mockFiles.set(saved.uri.replace('.m4a', '.json'), JSON.stringify(saved));
    mockFiles.set('file:///documents/recordings/recording-4444-abcd1234.m4a', 'orphan');
    mockFiles.set('file:///documents/recordings/recording-4444-abcd1234.json.part', 'partial');
    await cleanupAbandonedRecordings();
    expect(mockFiles.has('file:///cache/Audio/handson-pending-123.m4a')).toBe(false);
    expect(mockFiles.has('file:///cache/Audio/other.m4a')).toBe(true);
    expect(mockFiles.has(saved.uri)).toBe(true);
    expect(mockFiles.has('file:///documents/recordings/recording-4444-abcd1234.m4a')).toBe(false);
  });
});
