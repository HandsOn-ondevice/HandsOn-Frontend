import { expect, test } from '@playwright/test';

const demoSource = '/transcription?recordingId=recording-0-demo0001';

test('E03 수정 내용을 복원하고 저장 실패 후 같은 텍스트로 E04 초안을 연다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('radio', { name: '숙련 연구생, 절차 생성·승인' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  const environment = page.getByRole('radio', { name: '전자회로 실험실', exact: true });
  await environment.click();
  await expect(environment).toBeHidden();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await page.getByRole('button', { name: '새 절차 음성으로 만들기' }).click();

  const preview = page.getByRole('button', { name: 'STT 확인 화면 미리보기' });
  await preview.click();
  await expect(page).toHaveURL(demoSource);

  await expect(page.getByText('STT 변환이 완료되었습니다', { exact: true })).toBeVisible();
  const transcript = page.getByRole('textbox', { name: '변환 텍스트' });
  const createDraft = page.getByRole('button', { name: 'AI 절차 초안 생성' });
  await expect(transcript).toHaveValue(/\S/);
  await page.screenshot({ path: testInfo.outputPath('e03-transcription.png') });

  await transcript.fill('   ');
  await expect(createDraft).toBeDisabled();
  await expect(page).toHaveURL(demoSource);

  const confirmedText = 'LED 전원을 분리하고 측정 결과를 기록합니다.';
  await transcript.fill(confirmedText);
  await expect(createDraft).toBeEnabled();
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL('/expert/procedures/new');
  await preview.click();
  await expect(transcript).toHaveValue(confirmedText);

  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('handson-procedure-drafts-v1-')) {
        Storage.prototype.setItem = setItem;
        throw new Error('초안 저장 실패 테스트');
      }
      setItem.call(this, key, value);
    };
  });
  await createDraft.click();
  await expect(page.getByText('초안을 생성하지 못했어요', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(demoSource);
  await expect(transcript).toHaveValue(confirmedText);

  await createDraft.click();
  await expect(page).toHaveURL(/\/expert\/drafts\/[^/?#]+(?:\/generated)?$/);
  await expect(page.getByText('AI 절차 초안', { exact: true })).toBeVisible();
  await expect(
    page.getByText(confirmedText, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});
