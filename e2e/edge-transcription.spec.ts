/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const liveEdge = process.env.HANDSON_E2E_LIVE_EDGE === '1';
const edgeBaseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim().replace(/\/+$/, '');
const edgeToken = process.env.HANDSON_E2E_EDGE_TOKEN ?? 'demo-expert-token';
const title = 'LED 원본 전사 연동';
const fixtureText = 'LED 전원을 차단한 뒤 센서 배선을 확인합니다.';
const editedText = 'LED 전원을 차단한 뒤 센서 배선과 측정 결과를 확인합니다.';
const audioName = 'edge-transcription.m4a';
const environmentId = 'kit-lab';

test.skip(!liveEdge, '실제 Edge 시뮬레이션 서버를 대상으로 실행하는 검사입니다.');
// The token is entered as a password. Do not capture its value in an action trace.
test.use({ trace: 'off' });

async function openRecording(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '숙련 연구생, 절차 생성·승인' }).click();
  await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(edgeToken);
  const readEnvironments = page.waitForResponse(
    (response) =>
      response.url() === `${edgeBaseUrl}/api/v1/environments` &&
      response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: '작업 환경 불러오기', exact: true }).click();
  const response = await readEnvironments;
  expect(response.ok()).toBe(true);
  const environments = (await response.json()) as { id: string; name: string }[];
  const selected = environments.find(({ id }) => id === environmentId);
  if (!selected) throw new Error(`작업 환경 ${environmentId}가 응답에 없습니다.`);

  await page.getByRole('button', { name: /^연구실: / }).click();
  const environment = page.getByRole('radio', { name: selected.name, exact: true });
  await environment.click();
  await expect(environment).toBeHidden();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await page.getByRole('button', { name: '새 절차 음성으로 만들기' }).click();
}

async function expectUnobstructed(page: Page, target: Locator, footer: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect(footer).toBeInViewport({ ratio: 1 });
  const [targetBox, footerBox] = await Promise.all([target.boundingBox(), footer.boundingBox()]);
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(footerBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
}

type UploadEvidence = {
  key: string;
  status: number;
  recordingId: string;
  sizeBytes: number;
  sha256: string;
  replayed: boolean;
};

type TranscriptionEvidence = {
  requestId: string;
  recordingId: string;
  status: number;
  id?: string;
  text?: string;
};

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}×${viewport.height} 실제 Edge 원본 업로드, 전사 재시도, 편집 복원과 확정`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(90_000);
    if (!edgeBaseUrl) throw new Error('EXPO_PUBLIC_HANDSON_EDGE_BASE_URL을 설정해 주세요.');
    await page.setViewportSize(viewport);

    const uploads: UploadEvidence[] = [];
    const transcriptions: TranscriptionEvidence[] = [];
    const audio = await readFile(join(testInfo.config.rootDir, 'fixtures', audioName));
    const audioSha256 = createHash('sha256').update(audio).digest('hex');
    const uploadUrl = `${edgeBaseUrl}/api/v1/recordings`;
    const transcriptionUrl = `${edgeBaseUrl}/api/v1/transcriptions`;
    const releaseUpload = Promise.withResolvers<void>();
    const releaseTranscription = Promise.withResolvers<void>();
    const edgeAuthorization = `Bearer ${edgeToken}`;

    await page.route(uploadUrl, async (route) => {
      const upload = route.request();
      if (upload.method() !== 'POST') return route.continue();
      const headers = await upload.allHeaders();
      const multipart = upload.postDataBuffer();
      expect(headers.authorization === edgeAuthorization).toBe(true);
      expect(headers['content-type']).toMatch(/^multipart\/form-data;\s*boundary=/);
      expect(headers['idempotency-key']).toBeTruthy();
      expect(multipart?.includes(Buffer.from('name="file"; filename="'))).toBe(true);
      expect(multipart?.includes(Buffer.from('Content-Type: audio/mp4'))).toBe(true);
      expect(multipart?.includes(audio)).toBe(true);

      const response = await route.fetch();
      const { recordingId, sizeBytes, sha256 } = await response.json();
      uploads.push({
        key: headers['idempotency-key'],
        status: response.status(),
        recordingId,
        sizeBytes,
        sha256,
        replayed: response.headers()['x-idempotent-replay'] === 'true',
      });
      if (uploads.length === 1) {
        // Edge has stored the file. Lose only the response before the browser receives it.
        await releaseUpload.promise;
        await route.abort('failed');
      } else {
        await route.fulfill({ response });
      }
    });

    await page.route(transcriptionUrl, async (route) => {
      const transcription = route.request();
      if (transcription.method() !== 'POST') return route.continue();
      const headers = await transcription.allHeaders();
      const { requestId, recordingId } = transcription.postDataJSON();
      expect(headers.authorization === edgeAuthorization).toBe(true);
      expect(requestId).toEqual(expect.any(String));
      expect(recordingId).toBe(uploads[0].recordingId);
      if (transcriptions.length === 0) {
        await releaseTranscription.promise;
      } else {
        const seed = await request.post(`${edgeBaseUrl}/api/v1/simulation/transcripts`, {
          headers: { Authorization: edgeAuthorization },
          data: { requestId: `fixture-${requestId}`, recordingId, text: fixtureText },
        });
        expect(seed.ok()).toBe(true);
      }

      const response = await route.fetch();
      const { id, text } = await response.json();
      expect(response.status()).toBe(transcriptions.length === 0 ? 503 : 201);
      transcriptions.push({ requestId, recordingId, status: response.status(), id, text });
      await route.fulfill({ response });
    });

    try {
      await openRecording(page);
      await page.getByRole('textbox', { name: '절차 이름', exact: true }).fill(title);
      await page.getByLabel('준비된 오디오 파일', { exact: true }).setInputFiles({
        name: audioName,
        mimeType: 'audio/mp4',
        buffer: audio,
      });
      await expect(page).toHaveURL(/\/transcription\?recordingId=recording-/);
      const reviewUrl = new URL(page.url());
      const localId = reviewUrl.searchParams.get('recordingId');
      expect(localId).toBeTruthy();

      const token = page.getByLabel('숙련자 토큰', { exact: true });
      await token.fill(edgeToken);
      await page.getByRole('button', { name: '연결하고 진행', exact: true }).click();

      const confirm = page.getByRole('button', { name: 'AI 절차 초안 생성', exact: true });
      const uploadLoading = page.getByText('녹음을 업로드하고 있어요', { exact: true });
      await expectUnobstructed(page, uploadLoading, confirm);
      await expect(confirm).toBeDisabled();
      await testInfo.attach('e03-uploading', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      releaseUpload.resolve();

      const retryUpload = page.getByRole('button', { name: '업로드 다시 시도', exact: true });
      await expect(page.getByText('녹음을 업로드하지 못했어요', { exact: true })).toBeVisible();
      await expectUnobstructed(page, retryUpload, confirm);
      await testInfo.attach('e03-upload-error', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await retryUpload.click();

      const conversionLoading = page.getByText('음성을 텍스트로 변환하고 있어요', { exact: true });
      await expectUnobstructed(page, conversionLoading, confirm);
      await expect(confirm).toBeDisabled();
      releaseTranscription.resolve();

      const retryConversion = page.getByRole('button', { name: '변환 다시 시도', exact: true });
      await expect(page.getByText('음성을 변환하지 못했어요', { exact: true })).toBeVisible();
      await expectUnobstructed(page, retryConversion, confirm);
      await testInfo.attach('e03-transcription-error', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await retryConversion.click();

      const transcript = page.getByRole('textbox', { name: '변환 텍스트', exact: true });
      await expect(page.getByText('STT 변환이 완료되었습니다', { exact: true })).toBeVisible();
      await expect(transcript).toHaveValue(fixtureText);
      await expectUnobstructed(page, transcript, confirm);
      await transcript.fill('   ');
      await expect(confirm).toBeDisabled();
      await transcript.fill(editedText);
      await testInfo.attach('e03-edited', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });

      await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
      await page.getByRole('button', { name: '최근 녹음 다시 열기', exact: true }).click();
      await expect(page).toHaveURL(reviewUrl.href);
      await expect(transcript).toHaveValue(editedText);
      await confirm.click();
      await expect(page.getByText('전사문을 확정했어요', { exact: true })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(reviewUrl.href);
      await expect(transcript).toHaveValue(editedText);
      await expect(page.getByText('전사문을 확정했어요', { exact: true })).toBeVisible();
      const storage = await page.evaluate((id) => {
        const edge = localStorage.getItem(`handson-edge-transcription-v1-${id}`);
        return edge && JSON.parse(edge);
      }, localId);
      expect(storage).toMatchObject({
        recordingId: localId,
        baseUrl: edgeBaseUrl,
        serverRecordingId: uploads[0].recordingId,
        transcript: { originalText: fixtureText, editedText, confirmedText: editedText },
      });
      expect(await page.getByText(title, { exact: true }).isVisible()).toBe(true);
      expect(uploads).toEqual([
        {
          key: expect.any(String),
          status: 201,
          recordingId: expect.any(String),
          sizeBytes: audio.length,
          sha256: audioSha256,
          replayed: false,
        },
        { ...uploads[0], replayed: true },
      ]);
      expect(transcriptions).toEqual([
        { requestId: expect.any(String), recordingId: uploads[0].recordingId, status: 503 },
        {
          requestId: expect.any(String),
          recordingId: uploads[0].recordingId,
          status: 201,
          id: expect.any(String),
          text: fixtureText,
        },
      ]);
      expect(transcriptions[1].requestId).not.toBe(transcriptions[0].requestId);

      const original = await request.get(
        `${uploadUrl}/${encodeURIComponent(uploads[0].recordingId)}/audio`,
        { headers: { Authorization: edgeAuthorization } },
      );
      expect(original.ok()).toBe(true);
      expect((await original.body()).equals(audio)).toBe(true);

      const storedTranscript = await request.get(
        `${transcriptionUrl}/${encodeURIComponent(transcriptions[1].id!)}`,
        { headers: { Authorization: edgeAuthorization } },
      );
      expect(storedTranscript.ok()).toBe(true);
      expect(await storedTranscript.json()).toMatchObject({
        id: transcriptions[1].id,
        recordingId: uploads[0].recordingId,
        status: 'completed',
        text: fixtureText,
      });

      await testInfo.attach('edge-requests', {
        body: JSON.stringify(
          { viewport, localId, title, environmentId, uploads, transcriptions },
          null,
          2,
        ),
        contentType: 'application/json',
      });
    } finally {
      releaseUpload.resolve();
      releaseTranscription.resolve();
    }
  });
}
